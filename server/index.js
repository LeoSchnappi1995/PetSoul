import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { MongoClient, ObjectId } from 'mongodb';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const uploadDir = path.join(rootDir, 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 5178);
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'nature_spirit_dex';
const imageModel = process.env.IMAGE_MODEL || 'gpt-image-2';
const imageQuality = process.env.IMAGE_QUALITY || 'low';
const imageSize = process.env.IMAGE_SIZE || '1024x1024';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

let collection = null;
const memoryCaptures = [];

const officePlants = [
  {
    id: 'pothos',
    name: '绿萝',
    scientificName: 'Epipremnum aureum',
    aliases: ['绿萝', '黄金葛', 'Epipremnum aureum', 'pothos'],
    elementHint: '藤叶',
    rarity: 'N',
    silhouette: '萝',
    clue: '工位和茶水间最常见的藤蔓绿意。'
  },
  {
    id: 'snake-plant',
    name: '虎皮兰',
    scientificName: 'Dracaena trifasciata',
    aliases: ['虎皮兰', '虎尾兰', 'Sansevieria', 'Dracaena trifasciata', 'snake plant'],
    elementHint: '守护',
    rarity: 'R',
    silhouette: '虎',
    clue: '叶片像竖起的斑纹长剑。'
  },
  {
    id: 'money-tree',
    name: '发财树',
    scientificName: 'Pachira aquatica',
    aliases: ['发财树', '瓜栗', 'Pachira aquatica', 'money tree'],
    elementHint: '木',
    rarity: 'R',
    silhouette: '财',
    clue: '前台、会议室和老板办公室的祝福树。'
  },
  {
    id: 'monstera',
    name: '龟背竹',
    scientificName: 'Monstera deliciosa',
    aliases: ['龟背竹', 'Monstera deliciosa', 'monstera'],
    elementHint: '裂叶',
    rarity: 'SR',
    silhouette: '龟',
    clue: '大叶开孔，像一张热带地图。'
  },
  {
    id: 'spider-plant',
    name: '吊兰',
    scientificName: 'Chlorophytum comosum',
    aliases: ['吊兰', 'Chlorophytum comosum', 'spider plant'],
    elementHint: '风',
    rarity: 'N',
    silhouette: '吊',
    clue: '细长叶片垂下来，像绿色小瀑布。'
  },
  {
    id: 'peace-lily',
    name: '白掌',
    scientificName: 'Spathiphyllum wallisii',
    aliases: ['白掌', '一帆风顺', '和平百合', 'Spathiphyllum', 'peace lily'],
    elementHint: '光',
    rarity: 'SR',
    silhouette: '白',
    clue: '白色佛焰苞像办公室里升起的小帆。'
  },
  {
    id: 'succulent',
    name: '多肉',
    scientificName: 'Succulent plants',
    aliases: ['多肉', '多肉植物', '景天', 'succulent'],
    elementHint: '露',
    rarity: 'N',
    silhouette: '肉',
    clue: '小盆栽里的厚叶储水专家。'
  },
  {
    id: 'cactus',
    name: '仙人掌',
    scientificName: 'Cactaceae',
    aliases: ['仙人掌', '仙人球', 'Cactaceae', 'cactus'],
    elementHint: '砂',
    rarity: 'R',
    silhouette: '刺',
    clue: '电脑旁边的带刺沙漠居民。'
  },
  {
    id: 'aloe',
    name: '芦荟',
    scientificName: 'Aloe vera',
    aliases: ['芦荟', 'Aloe vera', 'aloe'],
    elementHint: '愈',
    rarity: 'R',
    silhouette: '芦',
    clue: '厚实叶片里藏着清凉感。'
  },
  {
    id: 'rubber-plant',
    name: '橡皮树',
    scientificName: 'Ficus elastica',
    aliases: ['橡皮树', '印度榕', 'Ficus elastica', 'rubber plant'],
    elementHint: '墨叶',
    rarity: 'SR',
    silhouette: '橡',
    clue: '深色厚叶带着一点高级感。'
  },
  {
    id: 'fiddle-leaf-fig',
    name: '琴叶榕',
    scientificName: 'Ficus lyrata',
    aliases: ['琴叶榕', 'Ficus lyrata', 'fiddle leaf fig'],
    elementHint: '乐叶',
    rarity: 'SSR',
    silhouette: '琴',
    clue: '像小提琴轮廓的大叶植物。'
  },
  {
    id: 'asparagus-fern',
    name: '文竹',
    scientificName: 'Asparagus setaceus',
    aliases: ['文竹', '云片松', 'Asparagus setaceus', 'asparagus fern'],
    elementHint: '云',
    rarity: 'SR',
    silhouette: '文',
    clue: '细碎轻盈，适合安静的书桌。'
  }
];

if (mongoUri) {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(mongoDbName);
  collection = db.collection('captures');
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ 'location.coordinates': '2dsphere' });
  console.log(`MongoDB connected: ${mongoDbName}.captures`);
} else {
  console.log('MONGODB_URI is not set. Using in-memory storage for this run.');
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  }
});

app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: collection ? 'mongodb' : 'memory', ai: openai ? 'openai' : 'mock' });
});

app.get('/api/me', async (_req, res) => {
  const captures = await listCaptures(200);
  const species = new Set(captures.map((item) => item.species.commonName));
  const cities = new Set(captures.map((item) => item.location.label).filter(Boolean));
  res.json({
    captures: captures.length,
    species: species.size,
    cities: cities.size,
    level: Math.max(1, Math.floor(captures.length / 5) + 1)
  });
});

app.get('/api/captures', async (_req, res) => {
  res.json({ captures: await listCaptures(80) });
});

app.get('/api/office-plants', async (_req, res) => {
  const captures = await listCaptures(200);
  res.json({ plants: buildOfficePlantDex(captures) });
});

app.get('/api/captures/:id', async (req, res) => {
  const capture = await findCapture(req.params.id);
  if (!capture) return res.status(404).json({ error: 'Capture not found' });
  res.json({ capture });
});

app.post('/api/captures', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo is required' });

  const imageUrl = `/uploads/${req.file.filename}`;
  const absoluteImagePath = path.join(uploadDir, req.file.filename);
  const latitude = parseNumber(req.body.latitude);
  const longitude = parseNumber(req.body.longitude);
  const locationLabel = String(req.body.locationLabel || '').trim();

  const species = await identifySpecies(absoluteImagePath, req.file.mimetype);
  const officePlant = matchOfficePlant(species);
  const spirit = createSpirit(species);
  const spiritImageUrl = await generateSpiritImage(absoluteImagePath, req.file.mimetype, species, spirit);
  const createdAt = new Date();
  const capture = {
    imageUrl,
    species,
    officePlantId: officePlant?.id,
    spirit,
    spiritImageUrl,
    location: {
      label: locationLabel || formatCoordinates(latitude, longitude),
      type: latitude && longitude ? 'Point' : undefined,
      coordinates: latitude && longitude ? [longitude, latitude] : undefined,
      latitude,
      longitude
    },
    createdAt,
    weather: '待接入天气',
    source: openai ? 'openai-assisted' : 'mock-mvp'
  };

  const saved = await saveCapture(capture);
  res.status(201).json({ capture: saved });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Petinder prototype running on http://localhost:${port}`);
});

async function identifySpecies(imagePath, mimeType) {
  if (!openai) return mockSpecies(imagePath);

  try {
    const imageBase64 = fs.readFileSync(imagePath).toString('base64');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You identify plants and animals from photos. Return compact JSON only.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identify the organism. Return JSON with commonName, scientificName, kingdom, category, confidence from 0 to 1, facts array of 3 short Chinese facts, and safetyNote in Chinese. If uncertain, use the best guess and lower confidence.'
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` }
            }
          ]
        }
      ]
    });
    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return normalizeSpecies(parsed);
  } catch (error) {
    console.warn('OpenAI identification failed, using mock species:', error.message);
    return mockSpecies(imagePath);
  }
}

function normalizeSpecies(input) {
  return {
    commonName: input.commonName || '未知自然生命',
    scientificName: input.scientificName || 'Unknown species',
    kingdom: input.kingdom || '自然界',
    category: input.category || '待确认',
    confidence: Math.max(0.2, Math.min(Number(input.confidence || 0.62), 0.99)),
    facts: Array.isArray(input.facts) && input.facts.length
      ? input.facts.slice(0, 3)
      : ['需要进一步观察叶片、花、果实或身体细节。', '建议从不同角度再次拍摄。', '请勿触碰不熟悉的野生动植物。'],
    safetyNote: input.safetyNote || '不熟悉的野生动植物建议只观察、不触摸。'
  };
}

function mockSpecies(imagePath) {
  const pool = [
    ['绿萝', 'Epipremnum aureum', '植物界', '办公室绿植'],
    ['虎皮兰', 'Dracaena trifasciata', '植物界', '办公室绿植'],
    ['发财树', 'Pachira aquatica', '植物界', '办公室绿植'],
    ['龟背竹', 'Monstera deliciosa', '植物界', '办公室绿植'],
    ['白掌', 'Spathiphyllum wallisii', '植物界', '办公室绿植'],
    ['多肉', 'Succulent plants', '植物界', '办公室绿植'],
    ['仙人掌', 'Cactaceae', '植物界', '办公室绿植'],
    ['文竹', 'Asparagus setaceus', '植物界', '办公室绿植']
  ];
  const hash = crypto.createHash('sha1').update(fs.readFileSync(imagePath)).digest()[0];
  const picked = pool[hash % pool.length];
  return {
    commonName: picked[0],
    scientificName: picked[1],
    kingdom: picked[2],
    category: picked[3],
    confidence: 0.58,
    facts: ['这是 MVP 演示识别结果。', '接入 OPENAI_API_KEY 后会尝试真实识别图片。', '图鉴会记录拍摄时间和地点。'],
    safetyNote: '演示结果仅供测试，请勿用于食用、用药或危险判断。'
  };
}

function buildOfficePlantDex(captures) {
  return officePlants.map((plant) => {
    const capture = captures.find((item) => item.officePlantId === plant.id || matchOfficePlant(item.species)?.id === plant.id);
    return {
      ...plant,
      aliases: undefined,
      unlocked: Boolean(capture),
      capture: capture ? {
        id: capture.id,
        imageUrl: capture.imageUrl,
        spiritImageUrl: capture.spiritImageUrl,
        createdAt: capture.createdAt,
        location: capture.location,
        species: capture.species,
        spirit: capture.spirit
      } : null
    };
  });
}

function matchOfficePlant(species) {
  const haystack = [
    species.commonName,
    species.scientificName,
    species.category,
    ...(species.facts || [])
  ].join(' ').toLowerCase();

  return officePlants.find((plant) =>
    plant.aliases.some((alias) => haystack.includes(alias.toLowerCase()))
  );
}

function createSpirit(species) {
  const traits = spiritTraits(species.commonName);
  return {
    name: traits.name,
    element: traits.element,
    rarity: traits.rarity,
    temperament: traits.temperament,
    palette: traits.palette,
    cardLine: `由「${species.commonName}」唤醒的${traits.element}系自然伙伴，喜欢出现在${traits.habitat}。`,
    abilities: traits.abilities
  };
}

async function generateSpiritImage(imagePath, mimeType, species, spirit) {
  if (!openai) return createFallbackSpiritImage(species, spirit);

  try {
    const prompt = [
      `Transform the reference photo into an original collectible nature-spirit creature.`,
      `The real organism is ${species.commonName} (${species.scientificName}).`,
      `Keep recognizable biological traits from the photo, but create a new non-IP fantasy companion.`,
      `Spirit name: ${spirit.name}. Element: ${spirit.element}. Temperament: ${spirit.temperament}.`,
      `Style: charming mobile game creature card art, polished, soft expressive face, clean silhouette, lush natural details, no text, no logo, no Pokeball, not Pokemon, not any existing character.`,
      `Composition: single full-body creature centered on a simple atmospheric background, vivid colors, suitable for a collection card.`
    ].join(' ');

    const result = await openai.images.edit({
      model: imageModel,
      image: fs.createReadStream(imagePath),
      prompt,
      size: imageSize,
      quality: imageQuality
    });
    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error('Image edit response did not include b64_json');

    const filename = `${Date.now()}-spirit-${crypto.randomBytes(6).toString('hex')}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(imageBase64, 'base64'));
    return `/uploads/${filename}`;
  } catch (error) {
    console.warn('OpenAI image edit failed, using fallback spirit image:', error.message);
    return createFallbackSpiritImage(species, spirit);
  }
}

function createFallbackSpiritImage(species, spirit) {
  const filename = `${Date.now()}-spirit-${crypto.randomBytes(6).toString('hex')}.svg`;
  const [c1, c2, c3] = spirit.palette;
  const initial = escapeXml(spirit.name.slice(0, 1));
  const speciesName = escapeXml(species.commonName);
  const spiritName = escapeXml(spirit.name);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="58%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="#101820"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="36%" r="48%">
      <stop offset="0%" stop-color="${c3}" stop-opacity=".95"/>
      <stop offset="100%" stop-color="${c3}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="80" fill="url(#bg)"/>
  <circle cx="512" cy="360" r="310" fill="url(#glow)"/>
  <path d="M330 616c-24-146 44-278 182-278s206 132 182 278c-19 117-93 196-182 196s-163-79-182-196Z" fill="#f7fbf7" opacity=".9"/>
  <path d="M342 420c-92-72-124-162-94-252 96 28 163 93 196 195" fill="${c3}" opacity=".82"/>
  <path d="M682 420c92-72 124-162 94-252-96 28-163 93-196 195" fill="${c3}" opacity=".82"/>
  <circle cx="430" cy="552" r="31" fill="#101820"/>
  <circle cx="594" cy="552" r="31" fill="#101820"/>
  <path d="M462 654c34 32 66 32 100 0" fill="none" stroke="#101820" stroke-width="24" stroke-linecap="round"/>
  <text x="512" y="514" text-anchor="middle" font-size="132" font-weight="900" font-family="Arial, sans-serif" fill="${c1}" opacity=".18">${initial}</text>
  <text x="512" y="900" text-anchor="middle" font-size="54" font-weight="800" font-family="Arial, sans-serif" fill="#f7fbf7">${spiritName}</text>
  <text x="512" y="954" text-anchor="middle" font-size="30" font-family="Arial, sans-serif" fill="#d9efe4">由 ${speciesName} 唤醒</text>
</svg>`;
  fs.writeFileSync(path.join(uploadDir, filename), svg.trim());
  return `/uploads/${filename}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function spiritTraits(seedText) {
  const names = ['风绒灵', '苔光兽', '花焰童', '露羽灵', '岩芽卫', '蜜纹骑士', '月叶狐', '澄波蛙'];
  const elements = ['草', '风', '水', '光', '岩', '虫', '木', '月'];
  const habitats = ['清晨的小路边', '雨后的草地', '阳光穿过树叶的地方', '安静的花丛旁'];
  const palettes = [
    ['#2f9d68', '#f4d35e', '#fff8df'],
    ['#4f7cac', '#8fd6ff', '#fffefd'],
    ['#b44b6b', '#ffbf69', '#fff1f2'],
    ['#7353ba', '#ffd166', '#f6f0ff'],
    ['#52796f', '#cad2c5', '#f7fff7']
  ];
  const hash = [...seedText].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    name: names[hash % names.length],
    element: elements[hash % elements.length],
    habitat: habitats[hash % habitats.length],
    rarity: ['N', 'R', 'SR', 'SSR'][hash % 4],
    temperament: ['好奇', '温顺', '警觉', '勇敢'][hash % 4],
    palette: palettes[hash % palettes.length],
    abilities: ['自然共鸣', '微光护盾', '季风跳跃'].slice(0, (hash % 3) + 1)
  };
}

async function listCaptures(limit) {
  if (collection) {
    return collection.find({}).sort({ createdAt: -1 }).limit(limit).toArray().then((rows) => rows.map(serializeCapture));
  }
  return memoryCaptures.slice(0, limit).map(serializeCapture);
}

async function findCapture(id) {
  if (collection && ObjectId.isValid(id)) {
    const row = await collection.findOne({ _id: new ObjectId(id) });
    return row ? serializeCapture(row) : null;
  }
  return memoryCaptures.find((item) => item._id === id) || null;
}

async function saveCapture(capture) {
  if (collection) {
    const result = await collection.insertOne(capture);
    return serializeCapture({ ...capture, _id: result.insertedId });
  }
  const saved = { ...capture, _id: crypto.randomUUID() };
  memoryCaptures.unshift(saved);
  return serializeCapture(saved);
}

function serializeCapture(capture) {
  return {
    ...capture,
    id: String(capture._id),
    _id: undefined,
    createdAt: capture.createdAt instanceof Date ? capture.createdAt.toISOString() : capture.createdAt
  };
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCoordinates(latitude, longitude) {
  if (!latitude || !longitude) return '未授权定位';
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}
