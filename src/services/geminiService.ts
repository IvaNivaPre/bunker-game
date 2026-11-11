import { AISummaryData, ATTRIBUTE_METADATA, PlayerData, RoomData } from '../types/game';
import { getGeminiApiKey, getGeminiModel, saveGeminiModel } from './storageService';

export const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-pro',
];

const AVAILABLE_MODELS_STORAGE_KEY = 'bunker_gemini_available_models_v1';

export interface GeminiTestResult {
  ok: boolean;
  message: string;
  modelUsed?: string;
  availableModels?: string[];
}

interface GoogleModelEntry {
  name: string; // e.g. "models/gemini-2.5-flash"
  displayName?: string;
  supportedGenerationMethods?: string[];
}

export function getCachedAvailableModels(): string[] {
  try {
    const raw = localStorage.getItem(AVAILABLE_MODELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_GEMINI_MODELS;
}

function saveCachedAvailableModels(models: string[]): void {
  try {
    localStorage.setItem(AVAILABLE_MODELS_STORAGE_KEY, JSON.stringify(models));
  } catch {
    // ignore
  }
}

/**
 * Calls ModelService.ListModels (GET /v1beta/models) to discover which Gemini models
 * actually exist and support generateContent for the user's API key.
 */
export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let parsedMsg = `HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.error?.message) {
        parsedMsg = errJson.error.message;
      }
    } catch {
      if (errText) parsedMsg = errText.slice(0, 200);
    }
    throw new Error(parsedMsg);
  }

  const data = await response.json();
  const rawModels: GoogleModelEntry[] = Array.isArray(data?.models) ? data.models : [];

  // Filter for Gemini text/multimodal models that support generateContent
  // Exclude specialized non-text endpoints (tts, image-generation, embedding, aqa, veo, imagen)
  const validModels = rawModels
    .filter((m) => {
      const methods = m.supportedGenerationMethods || [];
      if (!methods.includes('generateContent')) return false;
      const id = (m.name || '').replace(/^models\//, '').toLowerCase();
      if (!id.includes('gemini')) return false;
      if (
        id.includes('tts') ||
        id.includes('image') ||
        id.includes('embedding') ||
        id.includes('vision') ||
        id.includes('thinking') ||
        id.includes('computer-use') ||
        id.includes('robotics') ||
        id.includes('audio')
      ) {
        return false;
      }
      return true;
    })
    .map((m) => m.name.replace(/^models\//, ''));

  // Sort models to prioritize fast flash models
  const priorityOrder = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-pro',
    'gemini-pro-latest',
  ];

  validModels.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  if (validModels.length > 0) {
    saveCachedAvailableModels(validModels);
    return validModels;
  }

  return DEFAULT_GEMINI_MODELS;
}

async function callGeminiEndpoint(
  apiKey: string,
  model: string,
  prompt: string,
  jsonMode = false
): Promise<string> {
  const cleanModel = model.replace(/^models\//, '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let parsedMsg = `HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.error?.message) {
        parsedMsg = errJson.error.message;
      }
    } catch {
      if (errText) parsedMsg = errText.slice(0, 200);
    }
    throw new Error(parsedMsg);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Пустой ответ от модели Gemini');
  }
  return text;
}

export async function testGeminiApiKey(
  apiKeyInput: string,
  preferredModel?: string
): Promise<GeminiTestResult> {
  const apiKey = apiKeyInput.trim();
  if (!apiKey) {
    return { ok: false, message: 'Введите API-ключ Gemini' };
  }

  // Step 1: Call ModelService.ListModels to validate the key and get the exact supported models
  let discoveredModels: string[] = [];
  try {
    discoveredModels = await fetchAvailableGeminiModels(apiKey);
  } catch (listErr) {
    const msg = listErr instanceof Error ? listErr.message : String(listErr);
    if (msg.toLowerCase().includes('location is not supported')) {
      return {
        ok: false,
        message:
          'Ошибка региона: Google Gemini API отклоняет запросы с вашего текущего IP-адреса (User location is not supported). Включите VPN для работы с Gemini API.',
      };
    }
    return {
      ok: false,
      message: `Ошибка проверки ключа (ListModels): ${msg}`,
    };
  }

  // Build ordered list of models to test generateContent with
  const cleanPreferred = preferredModel?.replace(/^models\//, '').trim();
  const modelsToTry: string[] = [];

  if (cleanPreferred && discoveredModels.includes(cleanPreferred)) {
    modelsToTry.push(cleanPreferred);
  }
  for (const m of discoveredModels) {
    if (!modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }
  if (modelsToTry.length === 0) {
    modelsToTry.push(...DEFAULT_GEMINI_MODELS);
  }

  let firstMeaningfulError: string | null = null;

  // Try up to 4 candidate models from the discovered list
  for (const model of modelsToTry.slice(0, 4)) {
    try {
      const reply = await callGeminiEndpoint(
        apiKey,
        model,
        'Ответь одним словом: "ГОТОВО".',
        false
      );
      if (reply) {
        saveGeminiModel(model);
        return {
          ok: true,
          modelUsed: model,
          availableModels: discoveredModels,
          message: `Ключ успешно проверен! Выбрана рабочая модель: ${model} (Доступно моделей: ${discoveredModels.length})`,
        };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const lower = errMsg.toLowerCase();

      // If regional block, stop immediately and explain clearly
      if (lower.includes('location is not supported')) {
        return {
          ok: false,
          availableModels: discoveredModels,
          message:
            'Ключ распознан, но Google Gemini API блокирует генерацию из вашего региона (User location is not supported). Включите VPN в браузере.',
        };
      }

      // If invalid key, stop immediately
      if (lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
        return {
          ok: false,
          message: `Недействительный API-ключ: ${errMsg}`,
        };
      }

      // Do not overwrite a meaningful error (like 429 quota) with a 404 not found
      if (!firstMeaningfulError || !lower.includes('not found')) {
        firstMeaningfulError = `[${model}]: ${errMsg}`;
      }
    }
  }

  // If ListModels succeeded, the key IS valid, even if generateContent hit a temporary 429 quota limit
  if (discoveredModels.length > 0 && firstMeaningfulError?.toLowerCase().includes('quota')) {
    const fallbackModel = modelsToTry[0];
    saveGeminiModel(fallbackModel);
    return {
      ok: true,
      modelUsed: fallbackModel,
      availableModels: discoveredModels,
      message: `Ключ валиден (найдено ${discoveredModels.length} моделей, выбрана ${fallbackModel}), но сейчас исчерпан минутный лимит бесплатной квоты (429 Quota Exceeded). Подождите 1 минуту перед финалом.`,
    };
  }

  return {
    ok: false,
    availableModels: discoveredModels,
    message: `Ошибка генерации: ${firstMeaningfulError || 'Не удалось вызвать модель'}`,
  };
}

function formatPlayerDossier(player: PlayerData, index: number): string {
  const lines: string[] = [`Игрок #${index + 1}: ${player.name}`];
  for (const meta of ATTRIBUTE_METADATA) {
    const card = player.attributes[meta.key];
    if (!card) continue;
    const statusTag = card.revealed ? '[Было вскрыто]' : '[Вскрылось только внутри бункера!]';
    const abilityInfo = card.ability
      ? ` (Способность «${card.ability.name}»: ${card.ability.used ? 'применена' : 'не применялась'})`
      : '';
    lines.push(`  - ${meta.label}: ${card.text} ${statusTag}${abilityInfo}`);
  }
  return lines.join('\n');
}

export function buildFinaleSystemPrompt(room: RoomData): string {
  const playersList = Object.values(room.players || {});
  const survivors = playersList.filter((p) => p.isAlive);
  const exiled = playersList.filter((p) => !p.isAlive);

  const survivorsBlock = survivors.map((p, i) => formatPlayerDossier(p, i)).join('\n\n');
  const exiledBlock =
    exiled.length > 0
      ? exiled
          .map(
            (p) =>
              `- ${p.name} (Профессия: ${p.attributes.profession?.text || 'неизвестно'}, Здоровье: ${
                p.attributes.health?.text || 'неизвестно'
              }, Инвентарь: ${p.attributes.inventory?.text || 'нет'})`
          )
          .join('\n')
      : 'Никто не был изгнан.';

  return `Ты — аналитический и художественный ИИ-летописец психологической игры «Бункер».
Гермодвери убежища запечатаны. Проанализируй состав выживших, оснащение бункера, условия катастрофы и те скрытые характеристики (болезни, фобии, черты характера), которые игроки утаили на голосовании, но которые неизбежно вскрылись после герметизации.

=== ДАННЫЕ КАТАСТРОФЫ ===
Описание: ${room.settings.catastrophe}
${room.settings.threats ? `Угрозы снаружи: ${room.settings.threats}` : ''}

=== ПАРАМЕТРЫ БУНКЕРА ===
Вместимость: ${room.settings.capacity} чел. (Внутри оказалось: ${survivors.length} чел.)
Площадь убежища: ${room.settings.size} кв. м
Срок изоляции: ${room.settings.duration}
Запасы и оборудование бункера: ${room.settings.supplies}

=== ВЫЖИВШИЕ В БУНКЕРЕ (${survivors.length} чел.) ===
${survivorsBlock}

=== ИЗГНАННЫЕ НА ПОВЕРХНОСТЬ (${exiled.length} чел.) ===
${exiledBlock}

=== ТРЕБОВАНИЯ К ОТВЕТУ ===
Верни СТРОГО валидный JSON-объект без обёрток markdown со следующей структурой:
{
  "survivalProbability": <целое число от 0 до 100 — объективный процент вероятности выживания колонии>,
  "verdictTitle": "<короткий драматичный заголовок итога в верхнем регистре, например: 'КОВЧЕГ ВЫСТОЯЛ: НОВЫЙ РАССВЕТ' или 'КРАХ НА ВТОРОМ ГОДУ ИЗОЛЯЦИИ'>",
  "verdictSummary": "<резюме на 2-3 предложения: почему именно такой процент выживания, что стало главным плюсом и главной проблемой>",
  "roleDistribution": "<подробное описание того, как распределились роли между конкретными выжившими по именам>",
  "crises": [
    {
      "title": "<название кризиса в бункере>",
      "description": "<что именно произошло с упоминанием конкретных имён игроков, их болезней, фобий или инвентаря>",
      "severity": "low | medium | high | critical"
    }
  ],
  "outsideFate": "<что произошло с изгнанными игроками за гермодверью — пытались ли они штурмовать шлюз или выживали снаружи>",
  "civilizationOutcome": "<что произошло спустя ${room.settings.duration}, когда настало время открывать люк: кто дожил, смогли ли возродить популяцию и цивилизацию>",
  "chapters": [
    {
      "number": "ГЛАВА I",
      "title": "Герметизация и распределение ролей",
      "content": "<атмосферный художественный текст 1-й главы на 120-180 слов>"
    },
    {
      "number": "ГЛАВА II",
      "title": "Вскрытие тайн и первые кризисы",
      "content": "<атмосферный художественный текст 2-й главы на 120-180 слов про болезни, фобии и запасы>"
    },
    {
      "number": "ГЛАВА III",
      "title": "Испытание изоляцией",
      "content": "<атмосферный художественный текст 3-й главы на 120-180 слов про критический момент в бункере>"
    },
    {
      "number": "ГЛАВА IV",
      "title": "День открытия люка",
      "content": "<атмосферный художественный текст финальной 4-й главы на 120-180 слов>"
    }
  ]
}`;
}

export function generateProceduralFinale(room: RoomData): AISummaryData {
  const playersList = Object.values(room.players || {});
  const survivors = playersList.filter((p) => p.isAlive);
  const exiled = playersList.filter((p) => !p.isAlive);

  let score = 52;
  const crises: AISummaryData['crises'] = [];

  const allText = survivors
    .map((p) =>
      Object.values(p.attributes)
        .map((a) => a.text.toLowerCase())
        .join(' ')
    )
    .join(' ');
  const suppliesLower = (room.settings.supplies || '').toLowerCase();

  const hasDoctor =
    allText.includes('врач') ||
    allText.includes('хирург') ||
    allText.includes('вирусолог') ||
    allText.includes('мед');
  const hasEngineer =
    allText.includes('инженер') ||
    allText.includes('механик') ||
    allText.includes('сварщик') ||
    allText.includes('физик') ||
    allText.includes('робототехник');
  const hasFoodSpec =
    allText.includes('агроном') ||
    allText.includes('гидропон') ||
    allText.includes('повар') ||
    allText.includes('миколог') ||
    suppliesLower.includes('гидропон') ||
    suppliesLower.includes('фитоферм');

  if (hasDoctor) score += 14;
  else {
    score -= 10;
    crises.push({
      title: 'Отсутствие квалифицированного медика',
      description:
        'Любая инфекция и обострение хронических недугов лечились методом проб и ошибок по старым справочникам.',
      severity: 'high',
    });
  }

  if (hasEngineer) score += 14;
  else {
    score -= 12;
    crises.push({
      title: 'Деградация вентиляционных и энергетических систем',
      description:
        'На 11-м месяце фильтрационный контур начал давать сбои, а без профильного инженера ремонт занял критически много времени.',
      severity: 'high',
    });
  }

  if (hasFoodSpec) score += 12;
  else {
    score -= 6;
    crises.push({
      title: 'Дефицит свежих витаминов и рационирование',
      description:
        'К середине срока изоляции запасы консервов сократились, вынудив колонию перейти на жёсткую экономию калорий.',
      severity: 'medium',
    });
  }

  for (const s of survivors) {
    const h = s.attributes.health?.text || '';
    const hLower = h.toLowerCase();
    if (
      hLower.includes('диабет') ||
      hLower.includes('астма') ||
      hLower.includes('носитель') ||
      hLower.includes('лучевая') ||
      hLower.includes('эпилепсия')
    ) {
      if (hasDoctor) {
        score -= 2;
        crises.push({
          title: `Медицинский кризис: ${s.name}`,
          description: `Участник ${s.name} столкнулся с обострением (${h}), но благодаря медицинской помощи и запасам удалось стабилизировать состояние.`,
          severity: 'medium',
        });
      } else {
        score -= 9;
        crises.push({
          title: `Тяжёлое обострение: ${s.name}`,
          description: `Диагноз «${h}» у игрока ${s.name} вызвал острый кризис в замкнутом пространстве из-за нехватки профильного врача.`,
          severity: 'critical',
        });
      }
    }

    const ph = s.attributes.phobia?.text || '';
    const phLower = ph.toLowerCase();
    if (!phLower.includes('отсутствует') && !phLower.includes('преодолена')) {
      score -= 3;
      if (crises.length < 4) {
        crises.push({
          title: `Психологический срыв (${s.name})`,
          description: `Во время аварийного отключения освещения проявилась фобия: «${ph}», потребовавшая вмешательства всей группы.`,
          severity: 'low',
        });
      }
    }
  }

  if (crises.length === 0) {
    crises.push({
      title: 'Испытание замкнутым пространством',
      description:
        'На втором году изоляции накопилась психологическая усталость, однако чёткий график дежурств позволил избежать раскола.',
      severity: 'low',
    });
  }

  score = Math.max(8, Math.min(98, score));

  const survivorNames = survivors.map((s) => s.name).join(', ') || 'Выжившие';
  const exiledNames = exiled.map((e) => e.name).join(', ');

  const roleLines = survivors.map(
    (s) =>
      `${s.name} (${s.attributes.profession?.text || 'Универсал'}) взял на себя профильный сектор и предоставил в общее пользование: ${
        s.attributes.inventory?.text || s.attributes.backpack?.text || 'личные навыки'
      }.`
  );

  const verdictTitle =
    score >= 75
      ? 'ПРОТОКОЛ «КОВЧЕГ» УСПЕШЕН: ВОЗРОЖДЕНИЕ'
      : score >= 45
      ? 'ВЫЖИВАНИЕ НА ГРАНИ: ТЯЖЁЛАЯ ЦЕНА ИЗОЛЯЦИИ'
      : 'КРИТИЧЕСКИЙ СБОЙ СИСТЕМ ЖИЗНЕОБЕСПЕЧЕНИЯ';

  const verdictSummary =
    score >= 75
      ? `Группа (${survivorNames}) сформировала сбалансированный симбиоз специалистов. Оборудование бункера и личный инвентарь позволили преодолеть все кризисы.`
      : score >= 45
      ? `Колония смогла дожить до конца срока (${room.settings.duration}), но нехватка отдельных специалистов и скрытые недуги привели к суровым испытаниям.`
      : `Дисбаланс профессий и обострившиеся заболевания внутри замкнутого периметра поставили выживание бункера под прямую угрозу.`;

  return {
    generatedAt: Date.now(),
    source: 'procedural',
    survivalProbability: score,
    verdictTitle,
    verdictSummary,
    roleDistribution: roleLines.join(' '),
    crises,
    outsideFate:
      exiled.length > 0
        ? `За массивной гермодверью остались ${exiledNames}. В первые сутки датчики внешнего периметра фиксировали их попытки найти соседний технический люк и укрыться в заброшенных коммуникациях.`
        : 'Все участники изначально поместились в убежище, никто не остался снаружи.',
    civilizationOutcome:
      score >= 70
        ? `Спустя ${room.settings.duration} массивные ригели шлюза открылись. Группа вышла на очищающуюся поверхность с сохранённым оборудованием, запасом семян и знаниями для основания первого послевоенного поселения.`
        : score >= 40
        ? `Спустя ${room.settings.duration} гермодверь удалось открыть вручную. Измождённые, но живые обитатели бункера встретили рассвет нового мира, начав борьбу за ресурсы на поверхности.`
        : `К моменту окончания расчётного срока (${room.settings.duration}) ресурсы убежища были полностью истощены. Лишь чудом уцелевшим удалось подать сигнал бедствия соседним секторам.`,
    chapters: [
      {
        number: 'ГЛАВА I',
        title: 'Скрежет гермозатворов и новый порядок',
        content: `Когда гидравлические замки бункера (${room.settings.size} кв. м) сомкнулись, отсекая внешний мир (${room.settings.catastrophe}), внутри воцарилась звенящая тишина. ${survivorNames} провели полную ревизию складов (${room.settings.supplies}). Каждый понимал: впереди ${room.settings.duration} автономного плавания под землёй, где ошибка одного стоит жизни всем.`,
      },
      {
        number: 'ГЛАВА II',
        title: 'Скелеты в шкафах и распределение вахт',
        content: `Уже в первые месяцы стали очевидны детали, которые умалчивались во время трибунала. ${roleLines.join(
          ' '
        )} Скрытые особенности здоровья и характера каждого участника прошли проверку суровым бытом подземного комплекса.`,
      },
      {
        number: 'ГЛАВА III',
        title: 'Кризис середины срока',
        content:
          crises.map((c) => `${c.title}: ${c.description}`).join(' ') +
          ' Только жёсткая дисциплина и использование принесённого инвентаря удержали колонию от фатального исхода.',
      },
      {
        number: 'ГЛАВА IV',
        title: `Спустя ${room.settings.duration}: Свет за шлюзом`,
        content:
          score >= 50
            ? `Наступил финальный день изоляции. Дозиметры и газоанализаторы у внешнего шлюза показали снижение угрозы. Свернув гидропонные модули и упаковав снаряжение, выжившие провернули штурвал гермодвери. Холодный ветер новой эпохи ворвался в коридоры бункера — человечество получило второй шанс.`
            : `Таймер главного терминала обнулился после долгих ${room.settings.duration}. Аварийное освещение едва теплилось. Собрав последние силы, группа деблокировала ручной привод шлюза, выбираясь на суровую поверхность в поисках других выживших.`,
      },
    ],
  };
}

export async function generateBunkerFinale(room: RoomData): Promise<AISummaryData> {
  const apiKey = getGeminiApiKey();
  const preferredModel = getGeminiModel();

  if (!apiKey) {
    return generateProceduralFinale(room);
  }

  let availableModels = getCachedAvailableModels();
  try {
    availableModels = await fetchAvailableGeminiModels(apiKey);
  } catch {
    // use cached or default models
  }

  const prompt = buildFinaleSystemPrompt(room);
  const modelsToTry = [
    preferredModel,
    ...availableModels.filter((m) => m !== preferredModel),
  ];

  for (const model of modelsToTry.slice(0, 4)) {
    try {
      const rawResponse = await callGeminiEndpoint(apiKey, model, prompt, true);
      const cleaned = rawResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);
      const fallback = generateProceduralFinale(room);

      return {
        generatedAt: Date.now(),
        source: 'gemini',
        modelUsed: model,
        survivalProbability:
          typeof parsed.survivalProbability === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.survivalProbability)))
            : fallback.survivalProbability,
        verdictTitle: parsed.verdictTitle || fallback.verdictTitle,
        verdictSummary: parsed.verdictSummary || fallback.verdictSummary,
        roleDistribution: parsed.roleDistribution || fallback.roleDistribution,
        crises: Array.isArray(parsed.crises) && parsed.crises.length > 0 ? parsed.crises : fallback.crises,
        outsideFate: parsed.outsideFate || fallback.outsideFate,
        civilizationOutcome: parsed.civilizationOutcome || fallback.civilizationOutcome,
        chapters:
          Array.isArray(parsed.chapters) && parsed.chapters.length > 0
            ? parsed.chapters
            : fallback.chapters,
      };
    } catch (err) {
      console.warn(`Gemini model ${model} failed, trying next or fallback:`, err);
    }
  }

  return generateProceduralFinale(room);
}
