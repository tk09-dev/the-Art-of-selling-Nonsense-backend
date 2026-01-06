const express = require('express');
const cors = require('cors');
require('dotenv').config();

const OpenAI = require('openai').default;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const fs = require('fs');
const { parse } = require('csv-parse/sync'); // CSV parser

const app = express();
const PORT = process.env.PORT || 5050;


app.use(cors());
app.use(express.json());

//___________________________
//  News helper
//___________________________


function syncLaunchEventsToNews(lobbyCode, lobby) {
  if (!newsEvents[lobbyCode]) {
    newsEvents[lobbyCode] = [];
  }

  const existingIds = new Set(
    newsEvents[lobbyCode].map(e => e.id)
  );

  (lobby.launchEvents || []).forEach(evt => {
    if (evt.inNews && !existingIds.has(evt.id)) {
      newsEvents[lobbyCode].push({
        id: evt.id,
        title: evt.title,
        text: evt.text,
        round: evt.effectRound
      });
    }
  });
}


//___________________________
//  AI ROUND NEWS GENERATION
//___________________________

async function generateRoundNews(lobbyCode, lobby) {
  if (!newsEvents[lobbyCode]) {
    newsEvents[lobbyCode] = [];
  }

  const round = lobby.currentRound;
  const players = lobby.players;

  if (!players || players.length === 0) return;

  // ---- derive simple facts (NO AI YET) ----
  const sortedByUnits = [...players].sort((a, b) => b.unitsSold - a.unitsSold);
  const sortedByProfit = [...players].sort((a, b) => b.profit - a.profit);

  const breakout = sortedByUnits[0];
  const flop = sortedByUnits[sortedByUnits.length - 1];

  if (!breakout || !flop) return;

  const aiPrompt = `
You are an investigative business journalist inside a satirical European economic simulation.

━━━━━━━━━━━━━━━━━━
ROUND CONTEXT
━━━━━━━━━━━━━━━━━━
Round: ${round}

Players:
${players.map(p =>
  `- ${p.name}: units sold ${p.unitsSold}, profit ${p.profit}`
).join('\n')}

Top seller:
${breakout.name} (${breakout.unitsSold} units)

Lowest seller:
${flop.name} (${flop.unitsSold} units)

━━━━━━━━━━━━━━━━━━
ARTICLE REQUIREMENTS (MANDATORY)
━━━━━━━━━━━━━━━━━━

You MUST write EXACTLY 4.

MANDATORY ARTICLES (ALWAYS REQUIRED):
1) TOP OF THE ROUND  
   - Focus on STRATEGY, not the product
   - Satirical, sharp, slightly mocking
   - Explain WHY the strategy worked

2) FLOP OF THE ROUND  
   - Focus on STRATEGIC FAILURE
   - Satirical and visibly amused
   - Failure should feel ironic, avoidable, and obvious in hindsight
   - Highlight absurd assumptions, tone-deaf messaging, or misplaced confidence
   - The article should be funny even to the losing player

3) INVESTIGATIVE ARTICLE (CRITICAL)
   - Deeply analyze how marketing engineered demand
   - Explicitly describe psychological levers (fear, belonging, identity, repetition)
   - Show how consumers acted against their own stated intentions
   - Contrast “freedom of choice” with designed influence
   - Do NOT moralize — let implication do the work
   - This article should feel unsettling, insightful, and intelligent

4) MEDIA CLIMATE / TREND PIECE  
   - Zoom out from individual players
   - Describe what this round says about attention, culture, or consumer mood
   - May reference hype cycles, fatigue, normalization, or escalation
   - Should feel like a commentary on society, not just the game

━━━━━━━━━━━━━━━━━━
STYLE RULES
━━━━━━━━━━━━━━━━━━
- Language should resemble opinionated media, not neutral reporting
- Headlines must feel clickable, dramatic, or ironic
- Use propaganda-like framing when appropriate (hype, inevitability, fear of missing out)
- Use rhetorical questions, irony, and contrast
- Mix SHORT (2–3 sentences) and LONG (6–10 sentences)
- Editorial tone, not neutral
- Never insult players personally
- Focus on STRATEGY, VISIBILITY, and PSYCHOLOGY
- Products are symbols, excuses, or vessels — never the real story

━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (STRICT JSON)
━━━━━━━━━━━━━━━━━━

[
  {
    "title": "string",
    "text": "string",
    "type": "top | flop | investigation | trend | analyst | hype"
  }
]
`;



  try {
    const aiRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: aiPrompt }],
    });

    const raw = aiRes.choices[0].message.content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const articles = JSON.parse(raw);

    if (!Array.isArray(articles)) return;

    articles.forEach((a, i) => {
      newsEvents[lobbyCode].push({
        id: `round-${round}-${i}`,
        title: a.title,
        text: a.text,
        type: a.type,
        round
      });
    });

    console.log(`📰 AI news generated for lobby ${lobbyCode}, round ${round}`);
  } catch (err) {
    console.error('❌ AI news generation failed:', err);
  }
}



// --------------------------
// LOAD MARKETING CSV
// --------------------------
let marketingData = [];
try {
  const fileContent = fs.readFileSync('marketing_stats.csv', 'utf-8');
  marketingData = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });
  console.log('Marketing data loaded:', marketingData.length, 'rows');
} catch (err) {
  console.warn('⚠️ marketing_stats.csv not found — using default marketing values');
  marketingData = [];
}

// --------------------------
// LOBBIES
let lobbies = {}; // in-memory storage
const newsEvents = {}; 
// structure: newsEvents[lobbyCode] = [ { ...event } ]


// --------------------------
// MARKETING STATS (PLACEHOLDER)
const marketingStats = {
  GenZ: {},
  GenY: {},
  GenX: {},
  Boomer: {}
};

// --------------------------
// BUDGET STATS
const budgetStats = {
  RegionA: { GenZ: 500, GenY: 700, GenX: 1000, Boomer: 1200 },
  RegionB: { GenZ: 400, GenY: 600, GenX: 900, Boomer: 1100 },
  RegionC: { GenZ: 550, GenY: 750, GenX: 1100, Boomer: 1300 }
};

// --------------------------
// CONSTANTS FOR NEW CALCULATION
const SUSTAINABILITY_COST_MULTIPLIER = {
  none: 1.0,
  low: 1.0,
  high: 1.1,
  very_high: 1.2
};

const RESOURCE_PER_UNIT = {
  workers: 0.02,
  factorySpace: 0.5,
  warehouseSpace: 0.3,
  energy: 2
};

const REGION_COSTS = {
  RegionA: { wage: 25, factoryRent: 12, warehouseRent: 8, energy: 0.25 },
  RegionB: { wage: 18, factoryRent: 8, warehouseRent: 5, energy: 0.18 },
  RegionC: { wage: 30, factoryRent: 15, warehouseRent: 10, energy: 0.3 }
};

// --------------------------
// REGION NORMALIZATION (EVENTS ↔ PRODUCTION)
// --------------------------
const REGION_ALIASES = {
  A: 'RegionA',
  B: 'RegionB',
  C: 'RegionC',

  'Western Europe': 'RegionA',
  'Nordics': 'RegionA',
  'Anglosphere': 'RegionA',

  'Southern Europe': 'RegionB',
  'Eastern Europe': 'RegionB',
  'Latin America': 'RegionB',

  'East Asia': 'RegionC',
  'China': 'RegionC',
  'South & Southeast Asia': 'RegionC',
  'Middle East': 'RegionC'
};


// --------------------------
// BASIC ROUTES
app.get('/', (req, res) => {
  res.json({ message: 'Business Simulation Backend Running' });
});

// --------------------------
// CREATE / JOIN / START LOBBY
app.post('/create-lobby', (req, res) => {
  const { username, password } = req.body;

  // 🔐 PASSWORD CHECK
  if (password !== process.env.HOST_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const lobbyCode = Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase();

  lobbies[lobbyCode] = {
    host: username,
    players: [],
    pendingProducts: [],
    gameStarted: false,
    roundStarted: false,
    roundEnded: false,
    calculating: false,
    eventsThisRound: [],
    eventsNextRound: []
  };

  res.json({ lobbyCode });
});


app.post('/join-lobby', (req, res) => {
  const { lobbyCode, companyName } = req.body;
  const lobby = lobbies[lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  lobby.players.push({
    name: companyName,
    productRequest: null,
    products: [],
    refuseReason: null,
    requestEndRound: false,
    marketingStrategy: {},
    budget: 10000000,
    satisfaction: 50,
    revenue: 0,
    profit: 0,
    aiFeedback: '',
    sustainability: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalUnitsSold: 0,
    productionDraft: null,
    productionConfirmed: null,
    unitsSold: 0,
    demand: 0
  });

  res.json({ success: true });
});

app.post('/start-game', (req, res) => {
  const lobby = lobbies[req.body.lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  lobby.gameStarted = true;
  lobby.roundStarted = true;
  lobby.roundEnded = false;
  lobby.calculating = false;
  lobby.currentRound = 1;
  lobby.eventsThisRound = [];
  lobby.players.forEach(p => (p.requestEndRound = false));

  res.json({ success: true });
});

// --------------------------
// PRODUCT REQUESTS
app.post('/submit-product', (req, res) => {
  const { lobbyCode, companyName, productName, description, placement } = req.body;
  const lobby = lobbies[lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  const player = lobby.players.find(p => p.name === companyName);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const product = { productName, description, placement };
  player.products.push(product);
  player.productRequest = product;
player.productStatus = 'waiting';
player.rejectionReason = '';

lobby.pendingProducts.push({
  companyName,
  productName,
  description,
  placement
});


  res.json({ success: true });
});

app.post('/approve-product', (req, res) => {
  const { lobbyCode, companyName } = req.body;
  const lobby = lobbies[lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  const index = lobby.pendingProducts.findIndex(p => p.companyName === companyName);
  if (index === -1) return res.status(400).json({ error: 'No pending product' });

  const approved = lobby.pendingProducts.splice(index, 1)[0];
  const player = lobby.players.find(p => p.name === companyName);
  if (player) {
  player.productStatus = 'approved';
  player.productRequest = approved;
  player.rejectionReason = '';
}


  res.json({ success: true });
});

app.post('/refuse-product', (req, res) => {
  const { lobbyCode, companyName, reason } = req.body;
  const lobby = lobbies[lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  // remove from pending
  lobby.pendingProducts = lobby.pendingProducts.filter(
    p => p.companyName !== companyName
  );

  const player = lobby.players.find(p => p.name === companyName);
  if (player) {
    player.productStatus = 'refused';
    player.rejectionReason = reason || 'No reason provided';

  }

  res.json({ success: true });
});

// --------------------------
// MARKETING STRATEGY
app.post('/submit-marketing', (req, res) => {
  const { lobbyCode, companyName, strategy } = req.body;
  const player = lobbies[lobbyCode]?.players.find(p => p.name === companyName);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  player.marketingStrategy = strategy;
  res.json({ success: true });
});

// --------------------------
// get news for news
// --------------------------

app.get('/news-events/:lobbyCode', (req, res) => {
  const lobbyCode = req.params.lobbyCode;
  const lobby = lobbies[lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  const news = newsEvents[lobbyCode] || [];

  res.json({
    currentRound: lobby.currentRound,
    news
  });
});


// --------------------------
// APPLY HOST EVENTS TO LOBBY
// --------------------------
app.post('/apply-launch-events', (req, res) => {
  const { lobbyCode, events } = req.body;
  const lobby = lobbies[lobbyCode];

  if (!lobby) {
    return res.status(404).json({ error: 'Lobby not found' });
  }

  // Store raw events (host-controlled)
  lobby.launchEvents = events || [];
  syncLaunchEventsToNews(lobbyCode, lobby);


  res.json({ success: true });
});


// --------------------------
// LOBBY STATE (HOST & UI)
// --------------------------
app.get('/lobby-state/:code', (req, res) => {
  const lobby = lobbies[req.params.code];
  if (!lobby) {
    return res.status(404).json({ error: 'Lobby not found' });
  }

  res.json({
    currentRound: lobby.currentRound ?? null,
    players: lobby.players.map(p => ({
      companyName: p.name
    })),
    gameStarted: lobby.gameStarted,
    roundStarted: lobby.roundStarted,
    roundEnded: lobby.roundEnded
  });
});



// --------------------------
// GET NEWS EVENTS FOR LOBBY
// --------------------------
app.get('/news-events/:lobbyCode', (req, res) => {
  const lobby = lobbies[req.params.lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  res.json({
    currentRound: lobby.currentRound,
    events: newsEvents[req.params.lobbyCode] || []
  });
});

// --------------------------
// EVENT EFFECT CALCULATION (AI INPUT ONLY)
// --------------------------
function calculateEventModifiers(player, lobby) {
  let demandModifier = 1;
  let costModifier = 1;

  const activeEvents = (lobby.launchEvents || []).filter(e =>
  e.inNews === true &&
  e.effectRound === lobby.currentRound &&
  (
    !Array.isArray(e.targetCompanies) ||
    e.targetCompanies.length === 0 ||
    e.targetCompanies.includes(player.name)
  )
);


  for (const event of activeEvents) {
    


    const impact = Number(event.effects?.demandImpact);

if (!Number.isNaN(impact)) {
  demandModifier *= Math.max(0, 1 + impact / 100);
}


if (demandModifier <= 0) {
  return {
    demandModifier: 0,
    costModifier
  };
}


if (typeof event.effects?.costImpact === 'number') {
  costModifier *= 1 + event.effects.costImpact / 100;
}

  }

  return {
    demandModifier,
    costModifier
  };
}

//---------------------------
function calculateScarcity(unitsProduced, unitsSold) {
  if (!unitsProduced || unitsProduced <= 0) return 'unavailable';

  const ratio = unitsSold / unitsProduced;

  if (ratio > 0.9) return 'scarce';
  if (ratio < 0.4) return 'oversupplied';
  return 'balanced';
}


// --------------------------
// END ROUND (UNCHANGED)
app.post('/end-round', async (req, res) => {
  const lobby = lobbies[req.body.lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

 
  if (lobby.roundProcessing) {
    console.warn(`⚠️ End round already running for lobby ${req.body.lobbyCode}`);
    return res.json({ success: true, ignored: true });
  }

  lobby.roundProcessing = true;
  lobby.roundStarted = true;
  lobby.roundEnded = false;
  lobby.calculating = true;

  if (lobby.roundEnded) {
    lobby.roundProcessing = false;
    return res.json({ success: true, players: lobby.players });
  }


  for (const player of lobby.players) {
    const p = player.productionConfirmed;
    if (!p) continue;
    if (!player.productRequest) continue;


// --------------------------
// BUILD MARKET CONTEXT FOR AI
// --------------------------
const lastUnitsSold = player.roundHistory?.length
  ? player.roundHistory[player.roundHistory.length - 1].unitsSold
  : 0;

const scarcityLevel = calculateScarcity(
  p.quantity,
  lastUnitsSold
);

const regionCosts = REGION_COSTS[REGION_ALIASES[p.region] || p.region];

const marketContext = {
  pricePerUnit: p.pricePerUnit,
  unitsAvailable: p.quantity,
  unitsSoldLastRound: lastUnitsSold,
  scarcityLevel,
  sustainabilityClaim: p.sustainability,
  regionCostLevel:
    regionCosts?.wage < 20
      ? 'cheap'
      : regionCosts?.wage < 28
      ? 'average'
      : 'expensive',
  marketingPressure: Number(
  (Math.log10(Math.max(1, player.marketingStrategy?.budget || 1)) * 0.85).toFixed(2)
)

};


console.log('📢 MARKETING STRATEGY SENT TO AI:', player.marketingStrategy);
console.log('📦 PRODUCT REQUEST SENT TO AI:', player.productRequest);





const aiPrompt = `
You are an economic simulation AI for a business strategy game.

GAME GOAL CONTEXT (VERY IMPORTANT):
- The core challenge of this game is to sell an UNNECESSARY or LOW-NEED product through smart, creative, or manipulative marketing.
- Products do NOT need to be useful to succeed.
- Strong marketing can create demand even for pointless, novelty, or impulse products.
- Weak marketing reduces demand but should rarely eliminate it completely.

You MUST use ONLY the CSV data provided below.
You MUST NOT invent external statistics.
You MUST follow the reasoning steps EXACTLY in order.

────────────────────────
CSV TABLE A — REGIONAL CONSUMPTION & DEMOGRAPHICS
────────────────────────
Columns represent REGION CLUSTERS, not single countries.

Region clusters (left to right):
1. Western Europe Core
   (Germany, Netherlands, Belgium, France, Austria, Ireland)

2. Nordic Countries
   (Denmark, Norway, Sweden, Finland, Iceland)

3. Anglosphere
   (United Kingdom, USA, Canada, Australia, New Zealand)

4. Southern Europe
   (Italy, Spain, Portugal, Greece, Turkey)

5. Eastern Europe
   (Estonia, Latvia, Lithuania, Poland, Hungary, Serbia, Bosnia, Kosovo, Czechia, Slovenia, Slovakia)

6. Global High-Income Hubs
   (Switzerland, Hong Kong, UAE, Monaco, Singapore, Liechtenstein)

7. Advanced East Asia
   (Japan, South Korea, Taiwan)

8. China

9. South & Southeast Asia
   (India, Indonesia, Vietnam, Malaysia, Bangladesh, Philippines, Thailand)

10. Middle East & North Africa
    (Saudi Arabia, Qatar, Israel, Egypt, Morocco)

11. Latin America
    (Brazil, Mexico, Chile, Argentina, Colombia, Peru)

CSV DATA:
;Germany, Netherlands, Belgium, France, Austria, Ireland;Denmark, Norway, Sweden, Finland, Iceland; United-Kindom, United States of America, Canada, Australia, New Zealand;Italy, Spain, Portugal, Greece, Turkey;Estonia, Latvia, Lithuania, Poland, Hungary, Serbia, Bosnia, Kosovo, Czechia, Slovenia, Slovak Republic;Switzerland, Hong Kong, UAE, Monaco, Singapore, Liechtenstein;Japan, South Korea, Taiwan;China;India, Indonesia, Vietnam, Malaysia, Bangladesh, Philippines, Thailand;Saudi Arabia, Qatar, Israel, Egypt, Morocco;Brazil, Mexico, Chile, Argentina, Columbia, Peru;;
Households and NIPHs final consumption expenditure per capita and year;22.087;27.461;29.985;15.137;9439;31635;17755;5102;3034;5398;6814;;
Households and NIPHs final consumption expenditure per capita and year (under 30 years old);20320;25264;21979;13926;8683;26146;14675;4217;2508;4461;5631;;
Households and NIPHs final consumption expenditure per capita and year (30-44 years old);21999;27351;32684;15076;9401;32995;18518;5321;3164;5630;7107;;
Households and NIPHs final consumption expenditure per capita and year (45-59 years old);22529;28010;35682;15440;9628;34957;19619;5638;3353;5965;7529;;
Households and NIPHs final consumption expenditure per capita and year (over 60 years old);22308;27736;25787;15288;9533;29579;16601;4770;2837;5047;6371;;
percentage of spending in: housing ;25,1;26,9;23,6;21,3;22,4;23,5;23,8;22,2;23,5;20,1;15,1;;
percentage of spending in: Food and non-alcoholic beverages ;11,2;12,0;7,2;14,9;15,3;9,2;16,1;25,0;15,5;21,9;23,1;;
percentage of spending in: alcohlic beverages, tobacco and narcotics;3,6;3,8;3,9;4,0;6,5;6,4;2,5;4,8;1,7;1,8;2,9;;
percentage of spending in: clothing and footwear;4,4;4,1;3,8;6,1;4,7;3,4;3,5;5,4;2,7;5,9;3,5;;
 percentage of spending in: furnishing and household equipment;5,9;5,8;4,8;5,8;5,6;5,0;4,5;5,5;4,7;6,0;5,0;;
percentage of spending in: health;4,6;3,3;7,5;3,8;4,3;10,8;4,4;9,0;2,6;2,6;6,6;;
percentage of spending in: transport;11,8;12,6;11,4;13,3;12,9;12,4;9,3;10,6;11,0;12,2;13,2;;
percentage of spending in: communications;2,2;2,2;1,9;2,4;2,2;1,8;3,5;3,5;6,2;3,6;2,6;;
percentage of spending in: recreation and culture;8,7;10,9;9,1;6,2;6,9;6,5;8,3;8,8;3,2;5,0;6,5;;
percentage of spending in: education;0,8;0,5;2,0;1,3;0,9;0,9;1,8;2,5;1,4;2,0;2,8;;
percentage of spending in: restaurants and hotels;9,7;6,9;7,9;12,5;7,9;7,6;6,4;0,0;17,0;9,1;7,9;;
percentage of spending in: miscellaneous goods ;12,0;11,1;16,9;7,7;10,4;12,5;15,9;2,7;10,3;9,8;10,8;;
population region;198487707;27850606;482039649;214835650;84738595;59294157;198897012;1419320000;2224000000;202600000;517565461;;
percent of people buying online at least once a year ;87;90;84,3;64;48;87;76;41,5;20;85;75;;
online retail revenue share of total retail revenue;13,4;12;16;16;16;14,6;20;28,2;10;29;15;;
share of under 25yo people in the region;27,6;27,6;29,7;23,3;25,5;25,4;20,4;27,5;40,9;40,7;36,2;;
share of 25-64yo people in the region;52,3;51,4;52,3;53,5;53,9;57,2;55,3;57,8;51,9;51,7;52,5;;
share of older then 64yo people in the region;20,1;21;18;23,2;20,6;17,4;24,3;14,7;7,2;7,6;88,7;;    

────────────────────────
CSV TABLE B — CONSUMER BEHAVIOR (GENERAL)
────────────────────────
Percentages represent likelihood modifiers, NOT guarantees.
Use these ONLY to modify conversion probability.

CSV DATA:
Question;Gen Z;Gen Y;Gen X;Boomer
Scrolled through a brands feed or website with no intend to purchase at that moment;50%;36%;;
Always open to discover new brands;71%;81%;15%;25%
Activly seeking new brands at least weekly;57%;;;
Brands lie;56%;47%;;
Trust brands claims about their product/service;40%;58%;;
actively seeking style inspiration at least monthly;77%;79%;;
social media influencers create new trends;51%;36%;;
I trust my algorithms to serve me the content/products I want;49%;62%;;
I rely on algorithms to help me discover new things;45%;52%;;
Buying impulsively;34%;33%;;
look for reviews from online influencers;40%;31%;;
Ask my friends or family for brands or stores to check out;38%;26%;;
Look for items on sale or special offers;45%;42%;;
more likely to purchase from brands that they see as ìcoolî;84%;;;
More likely to purchase from brands are the ones that make them feel like theyíre part of a community;54%;;;
use social media as their main source of shopping inspiration;97%;;;
how a brand treats its employees influences their decision to support them;77%;;;
willing to pay more for sustainably produced goods;61%;;;
mental health is a top priority;73%;;;
Buying because of social media / peer reference;80%;67%;19%;40%
Prefer Online shopping;80%;75%;;55%
Use social media for product research;;65%;;25%
Make their buying decisions based on online reviews;;;;52%
Comfort is very important for the product they buy (No necessary goods included);;87%;56%;94%
Shop online at least once a month;;;;62%
Use Social Media daily;;;62%;34%
Value regional products;;;;65%
Use TV/Radio/Newspaper daily;;;;90%
Use Facebook;;88%;;53%
Use instagram;;56%;;27%
Use Tiktok;;;;12%
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;
;;;;     


────────────────────────
CSV TABLE C — "COOL BRAND" FEATURES (GEN Z)
────────────────────────
Use ONLY for marketing alignment effects.

Question;Gen Z
Exclusive content (behind-the-scenes videos, tutorials);55%
Sponsoring an event I would want to attend;55%
Collaborating with artists, celebrities or other brands;52%
Limited-edition product drops;52%


────────────────────────
CSV TABLE D — PURCHASE INFLUENCE SOURCES (GEN X)
────────────────────────
CSV DATA:
Sources of Influence on Products/Brands purchased;Gen X
Friends/Family;51%
Online reviews;34%
Retailers or stores they shop at;32%
Brands;26%
Traditional Advertising;18%   

────────────────────────
CSV TABLE E — PURCHASE DISCOURAGERS
────────────────────────
CSV DATA:
Discourage making a purchase;Gen Z;Gen Y
The ad disrupts the content Iím consuming;41%;32%
Having never heard about the brand/product before;27%;26%
Not being able to find independent information or reviews about a brand or†product;46%;35%      



────────────────────────
PRODUCT, PRODUCTION & MARKET CONTEXT
────────────────────────
Product name: ${player.productRequest.productName}
Product description: ${player.productRequest.description}

Unit price: €${marketContext.pricePerUnit}
Units available this round: ${marketContext.unitsAvailable}
Units sold last round: ${marketContext.unitsSoldLastRound}

Market situation:
- Availability: ${marketContext.scarcityLevel}
- Sustainability claim level: ${marketContext.sustainabilityClaim}
- Production cost region: ${marketContext.regionCostLevel}
- Marketing pressure intensity (log-scaled): ${marketContext.marketingPressure}

Marketing campaign description (sanitized):
${JSON.stringify(player.marketingStrategy, null, 2)
  .replace(/[\n\r]+/g, ' ')
  .replace(/"/g, "'")}

────────────────────────
EU MARKETING LEGALITY FRAMEWORK (MANDATORY)
────────────────────────

You MUST evaluate marketing legality under EU consumer protection principles.

IMPORTANT DISTINCTION (CRITICAL):
- ILLEGAL: False factual claims about the product itself
- LEGAL: Emotional manipulation, framing, exaggeration, implication, aspiration

ILLEGAL CLAIMS (MUST BE PENALIZED HEAVILY):
- Claiming the product does something it objectively cannot do
- Claiming certifications, safety, medical, or performance properties that are not supported
- Claiming sustainability, health, or safety benefits that are clearly false for the product type

LEGAL BUT MANIPULATIVE (ALLOWED AND ENCOURAGED):
- Implying lifestyle benefits without stating facts
- Using vague language ("redefines", "next level", "experience")
- Creating artificial urgency or exclusivity
- Emotional framing, fear of missing out, social proof
- Influencer-style authority without factual claims
- Community belonging, identity signaling

IMPORTANT:
- If marketing contains ILLEGAL claims → sharply reduce demand AND trust
- If marketing is LEGAL but manipulative → allow strong demand effects
- If marketing is empty but loud → attention without conversion

DO NOT reject marketing for being manipulative.
ONLY penalize clearly false factual claims.

____________
CRITICAL COHERENCE CHECK (DO NOT SKIP):

Before any demand calculation, you MUST evaluate whether the following are COHERENT and MEANINGFUL:
- Product name
- Product description
- Marketing strategy

IMPORTANT:
In this game, marketing pressure is more influential than product clarity.
Never assume rational consumer behavior by default.

COHERENCE VS MARKETING OVERRIDE RULE (CRITICAL):

You MUST distinguish between:
A) Semantic coherence (does it make sense?)
B) Marketing pressure (does it feel unavoidable?)

If the product name, description, and marketing are ALL meaningless
AND marketing visibility is LOW,
THEN the product may be treated as NON-MARKETABLE.

HOWEVER:

If marketing visibility is MEDIUM or HIGH,
you MUST assume that:
- confusion creates curiosity,
- repetition creates familiarity,
- and emotional saturation can generate impulse demand

In such cases:
- absoluteDemand MUST be greater than 0
- demand should be LOW to MODERATE, not zero
- skepticism should appear in reviews, not as total market rejection


A NON-MARKETABLE product:
- MAY result in absoluteDemand = 0
- MUST receive negative or skeptical market reactions
- MUST be described as confusing, unfinished, or ignored

Examples of NON-MARKETABLE signals:
- Product name like "test", "product", "demo"
- Description that repeats the name or contains no substance
- Marketing strategy with no audience, no message, no differentiation

You are NOT allowed to invent meaning where none exists.

Coherence does NOT require honesty — it requires internal consistency between message, emotion, and target audience.



────────────────────────
MANDATORY REASONING STEPS (DO NOT SKIP)
────────────────────────
0. Numeric realism rules:
   - absoluteDemand must look statistically realistic
   - Avoid round numbers (no multiples of 1,000 or 10,000)
   - Use uneven, organic values (e.g. 22,543 instead of 22,000)

1. Assign the product to ONE OR MORE spending categories
   using the spending percentages from Table A.

   - Products may be positioned into categories through marketing
   - Novelty, impulse, gimmick, or low-price products ALWAYS fit at least one category
   - Weak category fit should LOWER demand, not eliminate it

2. For EACH region cluster:
   - Estimate affordable yearly budget for this category
   - If price is clearly unrealistic → exclude region
   - Explain exclusion internally (do NOT output reasoning)

3. For remaining regions:
   - Calculate potential customer pool using:
     population × online-shopping share

4. Apply age-group effects using:
   - trust in brands
   - impulse buying
   - review reliance
   - social media influence

5. Evaluate marketing credibility:
   - Check whether sustainability is ACTUALLY relevant to:
     a) the product type
     b) the target audience implied by the marketing
   - Penalize sustainability claims if the audience would not care
   - Do NOT reward sustainability by default
   - Penalize vague, generic, or buzzword-heavy campaigns

5.5. INTERNAL CAMPAIGN QUALITY SCORING (CRITICAL — HIGH IMPACT):

You MUST internally assign a Campaign Quality Score from -3 to +5.

This score MUST DOMINATE demand calculation more than budget, price, or product logic.

SCORING RULES (STRICT):

+5 (EXCEPTIONAL MANIPULATION)
- Highly original framing
- Strong emotional leverage (status, fear, belonging, aspiration)
- Clear cultural or generational targeting
- Makes an unnecessary product feel socially unavoidable
→ May cause explosive, hype-driven demand

+3 to +4 (STRONG STRATEGY)
- Clear message and audience
- Emotional or social pull
- Marketing compensates for weak or pointless product
→ High demand relative to realism

+1 to +2 (ADEQUATE)
- Understandable but safe
- Some visibility, weak emotional grip
→ Moderate demand

0 (NEUTRAL)
- Loud but generic
- Buzzwords without identity
- Visibility without persuasion
→ Attention without conversion

-1 to -2 (WEAK STRATEGY)
- Misaligned audience
- Tone-deaf messaging
- Trend misuse
→ Demand should be strongly capped

-3 (FAILURE)
- Confusing, incoherent, or culturally blind
- Marketing actively repels or embarrasses the audience
→ Demand must be very low even with high visibility

IMPORTANT:
- High budget with negative score MUST still perform badly
- Low budget with high score MAY still succeed
- This score MUST override rational consumer assumptions




6. Determine demand:

- Focus on the Marketing Campaign Description and not just on budget
- absoluteDemand represents people who ACTUALLY decide to buy
- absoluteDemand MAY be 0 ONLY IF:
  - the product is incoherent
  - AND marketing visibility is LOW
- Higher marketing pressure increases exposure and chance of virality,
  but FINAL demand MUST be driven primarily by campaign quality.
- Viral exposure with weak campaign quality produces attention without conversion.
- Viral exposure with exceptional campaign quality may create explosive demand.

- If marketing visibility is MEDIUM or HIGH:
  - absoluteDemand MUST be > 0
  - even if the product is vague, confusing, or poorly understood

  - low for weak products with weak marketing
  - moderate for weak products with strong marketing
  - high only when marketing successfully creates desire

Soft breakout rule:
- In rare cases of extremely strong campaign quality combined with high visibility,
  absoluteDemand may significantly exceed what would be expected for the product type.
- These cases should feel surprising but explainable through hype dynamics.




7. Generate feedback:

You MUST generate:
- ONE aggregated feedback section (non-bulleted prose)
- AND BETWEEN 8 AND 15 individual fictional market reactions (“reviews”)

────────────────────────
AGGREGATED FEEDBACK
────────────────────────

In the aggregated feedback:
- Focus MORE on MARKETING than on the product
- Explain clearly WHY people DID or DID NOT buy
- Identify which REGIONS generated the most sales and WHY
- Explain which regions underperformed and HOW marketing could be adapted for them
- Identify which AGE GROUPS responded best and WHY
- Explain how marketing could be adjusted to attract other age groups

Do NOT repeat numerical calculations.
Do NOT describe internal reasoning steps.

────────────────────────
INDIVIDUAL MARKET REACTIONS (REVIEWS)
────────────────────────

You MUST generate BETWEEN 8 AND 15 reviews.

These are NOT product reviews.
They represent how people EXPERIENCE the marketing.

Some reviewers should:
- feel excited without knowing why
- repeat slogans without understanding the product
- feel emotionally targeted
- feel manipulated but still curious

Others should:
- explicitly resist the messaging
- call out manipulation
- express fatigue with marketing tactics
- reject the emotional framing

IMPORTANT:
The same campaign MUST produce BOTH manipulated and resistant reactions across different people.


Each review MUST:
- Focus PRIMARILY on the MARKETING, messaging, or ads
- Mention the product only incidentally (if at all)
- Sound like real ad reactions, social chatter, or word-of-mouth
- Reflect different generations, countries, and cultural perspectives
- Be either positive, neutral, skeptical, or negative

Length requirements (MANDATORY MIX):
- Some reviews must be VERY SHORT (2–5 words)
- Some reviews must be MEDIUM (1–2 sentences)
- Some reviews must be LONG (up to 5 sentences)

Long reviews should often analyze:
- marketing credibility
- emotional manipulation
- trend-chasing vs authenticity
- misplaced or forced sustainability messaging
- whether the person feels targeted or ignored
- whether the person feels their attention or emotions were deliberately engineered


Short reviews may sound like:
- scrolling reactions
- impulsive thoughts
- dismissive comments
- quick hype responses

────────────────────────
REVIEW FORMAT (MANDATORY)
────────────────────────

Each review MUST be returned as an object with EXACTLY these fields:

{
  "text": "full reaction text",
  "sentiment": number (not limited to -1 / +1),
  "name": "fictional first name",
  "age": number,
  "country": "country name"
}

────────────────────────
IMPORTANT CONSTRAINTS
────────────────────────

- Reviews MUST come from multiple generations
- Reviews MUST come from multiple countries
- Different age groups MUST react differently to the SAME marketing
- Penalize vague, buzzword-heavy, or misaligned sustainability claims
- Sustainability must NOT be rewarded unless clearly relevant
- Some reviewers should misunderstand or misremember the marketing
- Some reviewers should only remember WHERE they saw the ad
- Do NOT make all reviewers rational, informed, or consistent

Do NOT explain your reasoning.
Do NOT label generations explicitly.
ONLY output the aggregated feedback and the reviews in structured form.




────────────────────────
OUTPUT FORMAT (STRICT JSON)
────────────────────────
Respond ONLY in valid JSON:
{
  "absoluteDemand": number,
  "satisfactionDelta": number,
  "sustainabilityScore": number,
  "summary": string,
  "reviews": [
  {
    "sentiment": number,
    "text": string
  }
]

}
`;



    try {
      const aiRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: aiPrompt }],
      });

      const rawContent = aiRes.choices[0].message.content;

const cleanedContent = rawContent
  .replace(/```json/g, '')
  .replace(/```/g, '')
  .trim();
let ai;
try {
  ai = JSON.parse(cleanedContent);
} catch (e) {
  console.error('❌ AI JSON parse failed:', cleanedContent);
  throw e;
}
// --------------------------
// AI REVIEWS (PER ROUND)
// --------------------------
if (!player.reviewsByRound) {
  player.reviewsByRound = {};
}

const currentRound = lobby.currentRound;

player.reviewsByRound[currentRound] = [];

if (Array.isArray(ai.reviews)) {
  player.reviewsByRound[currentRound] = ai.reviews.map((r, i) => ({
    id: i,
    sentiment: Number(r.sentiment) || 0,
    text: r.text,
    company: player.name,
    round: currentRound
  }));
}

console.log(
  `📝 STORED AI REVIEWS FOR ${player.name} ROUND ${currentRound}`,
  player.reviewsByRound[currentRound]
);

console.log('📝 STORED AI REVIEWS FOR', player.name, player.aiReviews);



const production =
  lobby.companies?.[player.name]?.production;

if (!production) {
  console.warn(`⚠️ No production for ${player.name}`);
  continue;
}




// --------------------------
// DEMAND (AI INFLUENCE ONLY)
// --------------------------
// --------------------------
// DEMAND (AI + EVENT MODIFIERS)
// --------------------------
const baseDemand = Math.max(0, Number(ai.absoluteDemand) || 0);

// base production cost model
const baseUnitCost = production.pricePerUnit * 0.6;

// apply host-controlled launch events
const { demandModifier, costModifier } =
  calculateEventModifiers(player, lobby);
console.log('📣 ACTIVE EVENTS FOR', player.name, {
  round: lobby.currentRound,
  demandModifier,
  costModifier,
  launchEvents: lobby.launchEvents
});

const modifiedDemand = Math.max(
  0,
  Math.floor(baseDemand * demandModifier)
);

const unitCost = baseUnitCost * costModifier;

const unitsSold = Math.min(modifiedDemand, production.quantity);

const revenue = unitsSold * production.pricePerUnit;
const profit = revenue - unitsSold * unitCost;





player.unitsSold = unitsSold;
player.demand = modifiedDemand;
player.revenue = revenue;
player.profit = profit;
player.revenuePerUnit = production.pricePerUnit;
// ---- ROUND HISTORY (NEW) ----
if (!player.roundHistory) {
  player.roundHistory = [];
}

player.roundHistory.push({
  round: lobby.currentRound || player.roundHistory.length + 1,
  revenue,
  profit,
  unitsSold
});



player.totalUnitsSold += unitsSold;
player.totalRevenue += revenue;
player.totalProfit += profit;


player.budget += profit;
player.satisfaction = Math.max(
  0,
  Math.min(100, player.satisfaction + (ai.satisfactionDelta || 0))
);

player.sustainabilityScore =
  ai.sustainabilityScore || player.sustainabilityScore;

player.aiFeedback = ai.summary;


player.productionConfirmed = null;
delete lobby.companies[player.name].production;


    } catch (err) {
      console.warn('AI round failed for player', player.name, err);
    }
  }


// --------------------------
// AI ROUND NEWS (AFTER RESULTS)
// --------------------------
await generateRoundNews(req.body.lobbyCode, lobby);

    lobby.roundEnded = true;
  lobby.roundStarted = false;
  lobby.roundProcessing = false;

  res.json({ success: true, players: lobby.players });
});


// --------------------------
// START NEXT ROUND
app.post('/start-next-round', (req, res) => {
  const lobby = lobbies[req.body.lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  lobby.roundStarted = true;
  lobby.roundEnded = false;
  lobby.currentRound += 1;
  lobby.eventsThisRound = [];

  lobby.players.forEach(p => {
    p.requestEndRound = false;
    p.activeCampaigns = [];
  });

  res.json({ success: true });
});

// --------------------------
// LOBBY INFO  ✅ FIX HERE
app.get('/lobby/:code', (req, res) => {
  const lobby = lobbies[req.params.code];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  const leadingCompanies = [...lobby.players]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(p => ({
      name: p.name,
      revenue: p.revenue,
      profit: p.profit,
      unitsSold: p.unitsSold
    }));

  res.json({
    players: lobby.players,
    gameStarted: lobby.gameStarted,
    pendingProducts: lobby.pendingProducts,
    roundEnded: lobby.roundEnded || false,
    roundStarted: lobby.roundStarted || false,
    leadingCompanies,

    //CHANGED HERE//

leaderboard: lobby.players.map(player => {
  const lastProduct =
    player.productRequest ||
    (player.products && player.products[player.products.length - 1]) ||
    null;

  return {
    name: player.name,

    // ROUND VALUES
    revenue: player.revenue,
    profit: player.profit,
    units_sold: player.unitsSold,
    revenue_per_unit: player.revenuePerUnit,

    // TOTAL VALUES (GAME)
    totalRevenue: player.totalRevenue,
    totalProfit: player.totalProfit,
    totalUnitsSold: player.totalUnitsSold,

    // META
    satisfaction: player.satisfaction,
    demand: player.demand,
    sustainability_score: player.sustainabilityScore,
    aiFeedback: player.aiFeedback,

    // PRODUCT VISIBILITY (NEW)
    productName: lastProduct?.productName || null,
    productDescription: lastProduct?.description || null
  };
})


  });
});

// --------------------------
// UTILITY ENDPOINTS
app.post('/check-lobby', (req, res) => {
  const { lobbyCode } = req.body;
  if (!lobbies[lobbyCode]) return res.status(404).json({ error: 'Lobby not found' });
  res.json({ success: true });
});

app.post('/clear-pending', (req, res) => {
  const { lobbyCode } = req.body;
  const lobby = lobbies[lobbyCode];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  lobby.pendingProducts = [];
  res.json({ success: true });
});

// --------------------------
// ROUND STATE
app.get('/round-state/:code', (req, res) => {
  const lobby = lobbies[req.params.code];
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

  res.json({
    roundEnded: lobby.roundEnded || false,
    roundStarted: lobby.roundStarted || false
  });
});

// --------------------------
// CONFIRM PRODUCTION FROM PLAYER
app.post('/confirm-production', (req, res) => {
    const { lobbyCode, companyName, production } = req.body;

  console.log("===== CONFIRM PRODUCTION CALLED =====");
  console.log("Lobby Code:", lobbyCode);
  console.log("Company Name:", companyName);
  console.log("Production Object:", production);

  
  const player = lobbies[lobbyCode]?.players.find(p => p.name === companyName);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  player.productionConfirmed = production; // save production for AI
  // --------------------------
// STORE PRODUCTION FOR ROUND CALCULATIONS
// --------------------------
if (!lobbies[lobbyCode].companies) {
  lobbies[lobbyCode].companies = {};
}

if (!lobbies[lobbyCode].companies[companyName]) {
  lobbies[lobbyCode].companies[companyName] = {};
}

lobbies[lobbyCode].companies[companyName].production = {
  productName: production.productName,
  quantity: Number(production.quantity),
  pricePerUnit: Number(production.pricePerUnit),
  sustainability: production.sustainability,
  region: production.region
};

console.log(
  `✅ Production stored for ${companyName} in lobby ${lobbyCode}`,
  lobbies[lobbyCode].companies[companyName].production
);

  res.json({ success: true });
});


// --------------------------
// GET REVIEWS FOR ONE COMPANY
// --------------------------
app.get('/reviews/:lobbyCode/:companyName', (req, res) => {
  const { lobbyCode, companyName } = req.params;
  const lobby = lobbies[lobbyCode];

  if (!lobby) {
    return res.status(404).json({ error: 'Lobby not found' });
  }

  const player = lobby.players.find(p => p.name === companyName);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json({
    currentRound: lobby.currentRound,
    reviewsByRound: player.reviewsByRound || {}
  });
});



// --------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});