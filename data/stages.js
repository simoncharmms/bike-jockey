// Tour de France 2026 Stage Data
// 10 selected stages with varied profiles for spinning class use

const TDF_STAGES = [
  {
    id: 1,
    number: 1,
    name: "Grand Départ — Barcelona TTT",
    date: "July 4, 2026",
    start: "Barcelona",
    finish: "Barcelona (Montjuïc)",
    distance: 19.6,
    type: "tt",
    typeLabel: "Team Time Trial",
    typeIcon: "⏱",
    elevationGain: 231,
    avgSpeed: 52, // km/h — team TT pace
    description: "The 2026 Grand Départ — a Barcelona team time trial finishing at the iconic Montjuïc Olympic Stadium. Past Gaudí's Sagrada Família and up Montjuïc twice. First team time trial in seven years at the Tour. Whoever has the fastest team wears yellow first.",
    keyClimbs: [
      { name: "Montjuïc (lap 1)", gradient: 9, length: 1.6 },
      { name: "Montjuïc (lap 2)", gradient: 9, length: 1.6 }
    ],
    profile: [
      [0, 5], [2, 8], [4, 10], [6, 12], [8, 15], [9, 18],
      [10, 80], [11, 130], [11.6, 145], [12, 100], [13, 50],
      [14, 30], [15, 25], [16, 40], [17, 90], [18, 130],
      [18.5, 145], [19, 100], [19.6, 140]
    ],
    segments: []
  },
  {
    id: 6,
    number: 6,
    name: "Pyrenees — Gavarnie-Gèdre",
    date: "July 9, 2026",
    start: "Pau",
    finish: "Gavarnie-Gèdre",
    distance: 186.2,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "🏔️",
    elevationGain: 4800,
    avgSpeed: 24,
    description: "The first major mountain battle. Flat out of Pau, then the Pyrenees bite hard: Col d'Aspin and the iconic Col du Tourmalet (HC, 17.1km @ 7.4%) before a brand-new summit finish inside the Cirque de Gavarnie — UNESCO World Heritage and one of the most spectacular settings in cycling.",
    keyClimbs: [
      { name: "Col d'Aspin (Cat.2)", gradient: 6.5, length: 12.0 },
      { name: "Col du Tourmalet (HC)", gradient: 7.4, length: 17.1 },
      { name: "Gavarnie-Gèdre (summit finish)", gradient: 5.5, length: 10.0 }
    ],
    profile: [
      [0, 190], [10, 200], [20, 220], [30, 240], [40, 260], [50, 280],
      [60, 310], [70, 340], [80, 400], [83, 460], [88, 650],
      [93, 960], [96, 1200], [99, 1380], [101, 1489],
      [105, 1200], [108, 1050], [110, 980],
      [112, 1010], [116, 1200], [120, 1450], [124, 1700],
      [128, 1900], [131, 2115],
      [134, 1800], [138, 1500], [142, 1200], [146, 1000],
      [150, 820], [154, 740], [158, 750], [162, 800],
      [166, 850], [169, 900], [172, 960], [175, 1020],
      [178, 1100], [181, 1220], [183, 1280], [186.2, 1360]
    ],
    segments: []
  },
  {
    id: 10,
    number: 10,
    name: "Bastille Day — Le Lioran",
    date: "July 14, 2026",
    start: "Aurillac",
    finish: "Le Lioran",
    distance: 166.6,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "🏔️",
    elevationGain: 3978,
    avgSpeed: 25,
    description: "Bastille Day in the heart of the Massif Central. From Aurillac into the volcanic highlands — Puy Mary, Col de Pertus, and the unrelenting climbs of the Cantal towards a summit finish at Le Lioran ski station. Expect a wild French crowd and an all-out GC battle on national day.",
    keyClimbs: [
      { name: "Pas de Peyrol (Puy Mary) (Cat.1)", gradient: 6.7, length: 10.7 },
      { name: "Col de Pertus (Cat.2)", gradient: 7.1, length: 5.8 },
      { name: "Côte de Murat (Cat.3)", gradient: 5.8, length: 4.2 },
      { name: "Le Lioran (HC, summit finish)", gradient: 6.4, length: 12.3 }
    ],
    profile: [
      [0, 610], [5, 640], [10, 680], [15, 720], [20, 760],
      [25, 800], [28, 850], [32, 1000], [36, 1200], [40, 1400],
      [42, 1588], [45, 1350], [48, 1100], [52, 900],
      [55, 800], [58, 860], [62, 1000], [65, 1200], [67, 1318],
      [70, 1100], [73, 950], [76, 820], [80, 780],
      [85, 800], [88, 820], [90, 900], [93, 950],
      [97, 1020], [100, 980], [103, 870], [106, 780],
      [110, 750], [113, 790], [116, 840], [118, 890],
      [120, 950], [123, 1000], [126, 900], [129, 820],
      [132, 780], [135, 810], [138, 870], [141, 900],
      [144, 860], [147, 820], [150, 790], [153, 820],
      [154, 900], [156, 1020], [158, 1100], [160, 1150],
      [162, 1180], [164, 1220], [166.6, 1253]
    ],
    segments: []
  },
  {
    id: 14,
    number: 14,
    name: "Vosges — Le Markstein Fellering",
    date: "July 18, 2026",
    start: "Mulhouse",
    finish: "Le Markstein Fellering",
    distance: 155.3,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "🏔️",
    elevationGain: 4200,
    avgSpeed: 26,
    description: "A Vosges mountain stage with a relentless succession of climbs: Grand Ballon (HC), Col du Page, Ballon d'Alsace, and Col du Haag before the summit finish at Le Markstein Fellering. No flat sections — the race is on from the gun in Mulhouse.",
    keyClimbs: [
      { name: "Grand Ballon (HC)", gradient: 5.1, length: 20.8 },
      { name: "Col du Page (Cat.3)", gradient: 5.8, length: 4.0 },
      { name: "Ballon d'Alsace (Cat.1)", gradient: 7.1, length: 9.4 },
      { name: "Col du Haag (Cat.3)", gradient: 6.2, length: 3.5 },
      { name: "Le Markstein Fellering (HC)", gradient: 7.4, length: 7.5 }
    ],
    profile: [
      [0, 245], [5, 290], [10, 360], [15, 480], [20, 660],
      [25, 850], [30, 1050], [35, 1200], [40, 1350], [44, 1424],
      [47, 1250], [50, 1050], [52, 1000], [54, 1100], [56, 1150],
      [58, 1000], [62, 750], [65, 600], [68, 480],
      [72, 450], [75, 500], [78, 650], [81, 850],
      [84, 1000], [87, 1165], [90, 1050],
      [93, 900], [96, 800], [98, 870],
      [100, 830], [103, 780], [106, 700],
      [109, 750], [112, 820], [114, 870],
      [116, 820], [119, 760], [122, 700],
      [125, 720], [128, 760], [131, 810],
      [134, 850], [137, 880], [140, 900],
      [142, 870], [145, 850], [148, 920],
      [150, 1000], [152, 1100], [153.5, 1180], [155.3, 1202]
    ],
    segments: []
  },
  {
    id: 15,
    number: 15,
    name: "Alps Entry — Plateau de Solaison",
    date: "July 19, 2026",
    start: "Champagnole",
    finish: "Plateau de Solaison",
    distance: 183.9,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "🏔️",
    elevationGain: 4100,
    avgSpeed: 25,
    description: "The race enters the Alps via Haute-Savoie with two brutally steep climbs as bookends. Le Salève (4.7km @ 11.2%) is a wall of a climb before the Jura-to-Alps transition. The finale on Plateau de Solaison (11.3km @ 9.1%) is one of the steepest summit finishes of the entire race.",
    keyClimbs: [
      { name: "Col de la Faucille (Cat.1)", gradient: 6.2, length: 11.0 },
      { name: "Le Salève (Cat.1)", gradient: 11.2, length: 4.7 },
      { name: "Plateau de Solaison (HC)", gradient: 9.1, length: 11.3 }
    ],
    profile: [
      [0, 541], [5, 580], [10, 630], [15, 700], [20, 780],
      [25, 900], [30, 1000], [35, 1100], [38, 1200], [40, 1320],
      [43, 1200], [47, 1000], [50, 850], [53, 700],
      [58, 620], [63, 580], [68, 560], [73, 540],
      [78, 530], [83, 520], [88, 510], [93, 500],
      [98, 510], [103, 530], [108, 550], [113, 580],
      [118, 600], [123, 620], [128, 640],
      [133, 660], [136, 700], [139, 800],
      [141, 1000], [143, 1200], [145, 1380],
      [147, 1200], [150, 1000], [152, 850],
      [155, 750], [158, 700], [161, 680],
      [165, 700], [168, 750], [171, 810],
      [174, 870], [176, 950], [178, 1100],
      [180, 1280], [181.5, 1400], [183, 1480], [183.9, 1500]
    ],
    segments: []
  },
  {
    id: 16,
    number: 16,
    name: "Alpine Time Trial — Évian-les-Bains",
    date: "July 21, 2026",
    start: "Évian-les-Bains",
    finish: "Thonon-les-Bains",
    distance: 26.1,
    type: "tt",
    typeLabel: "Individual Time Trial",
    typeIcon: "⏱",
    elevationGain: 380,
    avgSpeed: 45,
    description: "The decisive Alpine time trial opens the final week. 26km along the shores of Lake Geneva from Évian to Thonon-les-Bains — mostly flat with a few gentle rollers. Pure power wins here. GC gaps get time-checked before the brutal Alpine mountain stages to follow.",
    keyClimbs: [],
    profile: [
      [0, 372], [2, 375], [4, 380], [6, 390], [8, 400],
      [10, 410], [12, 420], [14, 415], [16, 410],
      [18, 405], [20, 400], [22, 395], [24, 385], [26.1, 380]
    ],
    segments: []
  },
  {
    id: 18,
    number: 18,
    name: "Alpine Stage — Orcières-Merlette",
    date: "July 23, 2026",
    start: "Voiron",
    finish: "Orcières-Merlette",
    distance: 185.2,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "🏔️",
    elevationGain: 4600,
    avgSpeed: 24,
    description: "The first of three consecutive Alpine knockout stages. From Voiron deep into the southern Alps, finishing at the ski resort of Orcières-Merlette (13km @ 6.7%). Orcières-Merlette last featured in the 1971 Tour where Eddy Merckx lost a stage for the first time. Expect fireworks with Alpe d'Huez looming the next two days.",
    keyClimbs: [
      { name: "Col de Menée (Cat.1)", gradient: 6.3, length: 14.5 },
      { name: "Col de la Sentinelle (Cat.2)", gradient: 6.0, length: 8.0 },
      { name: "Orcières-Merlette (HC)", gradient: 6.7, length: 13.0 }
    ],
    profile: [
      [0, 290], [5, 320], [10, 360], [15, 420], [20, 500],
      [25, 600], [30, 750], [35, 900], [40, 1100], [44, 1250],
      [47, 1400], [50, 1350], [53, 1100], [56, 900], [59, 750],
      [62, 650], [66, 600], [70, 580], [74, 600],
      [78, 640], [82, 700], [85, 780], [88, 860],
      [91, 950], [93, 1020], [95, 880], [98, 750],
      [101, 660], [104, 600], [107, 580], [110, 570],
      [113, 590], [116, 620], [119, 680], [122, 740],
      [125, 800], [128, 850], [130, 870], [133, 840],
      [136, 800], [139, 820], [142, 880], [145, 940],
      [148, 1000], [151, 1060], [154, 1100], [157, 1050],
      [160, 1000], [162, 970], [165, 1000], [167, 1050],
      [169, 1100], [172, 1200], [174, 1300], [176, 1450],
      [178, 1580], [180, 1680], [182, 1770], [185.2, 1838]
    ],
    segments: []
  },
  {
    id: 19,
    number: 19,
    name: "Alpe d'Huez I — Gap to the Alpe",
    date: "July 24, 2026",
    start: "Gap",
    finish: "Alpe d'Huez",
    distance: 127.9,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "🏔️",
    elevationGain: 3500,
    avgSpeed: 25,
    description: "Stage 19: Alpe d'Huez. The most famous climb in cycling — 21 hairpin bends, 13.8km @ 8.1%, rising to 1,860m above the valley floor. 2026 brings a two-day Alpe d'Huez double, making this the first instalment. Short stage, maximum suffering. The 21 hairpins are each named after a past Tour winner.",
    keyClimbs: [
      { name: "Col d'Ornon (Cat.1)", gradient: 5.3, length: 15.7 },
      { name: "Alpe d'Huez (HC)", gradient: 8.1, length: 13.8 }
    ],
    profile: [
      [0, 735], [5, 780], [10, 840], [15, 920], [20, 1000],
      [25, 1100], [30, 1200], [35, 1321], [38, 1200],
      [41, 1050], [44, 920], [47, 840], [50, 780],
      [53, 740], [56, 720], [59, 710], [62, 700],
      [65, 710], [68, 720], [71, 730], [74, 720],
      [77, 710], [80, 700], [83, 690], [86, 700],
      [89, 710], [92, 720], [95, 730], [98, 720],
      [100, 730], [103, 725], [106, 720], [108, 718],
      [110, 715], [112, 712], [113, 710], [114.1, 720], // Le Bourg d'Oisans — ADH base
      [115, 800], [116, 880], [117, 960], [118, 1040],
      [119, 1120], [120, 1200], [121, 1280], [122, 1360],
      [123, 1440], [124, 1520], [125, 1600], [126, 1680],
      [127, 1760], [127.9, 1860]
    ],
    segments: []
  },
  {
    id: 20,
    number: 20,
    name: "Queen Stage — Alpe d'Huez Double",
    date: "July 25, 2026",
    start: "Le Bourg d'Oisans",
    finish: "Alpe d'Huez",
    distance: 170.9,
    type: "mountain",
    typeLabel: "Mountain",
    typeIcon: "👑",
    elevationGain: 5600,
    avgSpeed: 22,
    description: "THE queen stage of the 2026 Tour — the hardest day of the race. Croix de Fer (HC), Col du Télégraphe (Cat.1), the mythical Col du Galibier (HC, 2642m), then Col de Sarenne before the decisive Alpe d'Huez for a second consecutive day. Nearly 5,600m of climbing. The race will be decided here.",
    keyClimbs: [
      { name: "Col de la Croix de Fer (HC)", gradient: 5.1, length: 30.0 },
      { name: "Col du Télégraphe (Cat.1)", gradient: 6.9, length: 11.9 },
      { name: "Col du Galibier (HC)", gradient: 6.9, length: 18.1 },
      { name: "Col de Sarenne (Cat.2)", gradient: 7.4, length: 7.0 },
      { name: "Alpe d'Huez (HC)", gradient: 8.1, length: 13.8 }
    ],
    profile: [
      [0, 710], [5, 800], [10, 950], [15, 1100], [20, 1250],
      [25, 1400], [30, 1550], [35, 1700], [40, 1850], [44, 1980],
      [46, 2067],
      [50, 1650], [54, 1350], [57, 1100], [60, 920],
      [62, 1000], [64, 1100], [66, 1300], [68, 1450],
      [70, 1566],
      [74, 1700], [78, 1900], [82, 2100], [86, 2350],
      [88, 2480], [90, 2580], [91, 2642],
      [95, 2400], [98, 2200], [100, 2000],
      [102, 1850], [104, 1800], [105, 1999],
      [107, 1820], [109, 1635], [111, 1450], // Sarenne descent — steep 9% avg
      [113, 1270], [115, 1090], [117, 910],
      [119, 720], // Le Bourg d'Oisans valley floor
      [121, 718], [123, 715], [125, 712],
      [127, 710], [129, 712], [131, 715],
      [133, 718], [135, 715], [137, 712],
      [139, 710], [141, 712], [143, 715],
      [145, 718], [147, 715], [149, 712],
      [151, 710], [153, 712], [155, 715],
      [157, 718], [157.1, 720], // Le Bourg d'Oisans — ADH base (second time)
      [158, 800], [159, 880], [160, 960],
      [161, 1040], [162, 1120], [163, 1200],
      [164, 1280], [165, 1360], [166, 1440],
      [167, 1520], [168, 1600], [169, 1680],
      [170, 1760], [170.9, 1860]
    ],
    segments: []
  },
  {
    id: 21,
    number: 21,
    name: "Champs-Élysées — Paris",
    date: "July 26, 2026",
    start: "Thoiry",
    finish: "Paris Champs-Élysées",
    distance: 133,
    type: "sprint",
    typeLabel: "Sprint",
    typeIcon: "🏆",
    elevationGain: 950,
    avgSpeed: 44,
    description: "The final stage — Thoiry to the Champs-Élysées via three ascents of Montmartre (1.1km @ 5.9%). A ceremonial parade for most, then pure chaos on the Parisian cobbles. The yellow jersey champion crosses the line on the most famous avenue in the world. C'est le Tour.",
    keyClimbs: [
      { name: "Butte Montmartre (×3)", gradient: 5.9, length: 1.1 }
    ],
    profile: [
      [0, 190], [10, 200], [20, 215], [30, 225], [40, 235],
      [50, 245], [60, 255], [70, 265], [80, 270], [85, 275],
      [90, 270], [93, 265], [96, 268],
      [98, 75], [99, 125], [100, 130], [101, 75],
      [103, 65], [104.5, 70], [105.5, 125], [106.5, 130],
      [107.5, 70], [109, 60], [110.5, 68], [111.5, 125],
      [112.5, 130], [113.5, 70],
      [116, 55], [119, 40], [122, 38], [125, 36],
      [128, 35], [130, 32], [133, 30]
    ],
    segments: []
  }
];

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TDF_STAGES };
}
