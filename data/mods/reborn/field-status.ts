// Verified against Reborn 19.5 Battle_MoveEffects.rb. Other status interactions remain pending.
export const STATUS_BOOSTS: Record<string, Record<string, SparseBoostsTable>> = {
 mirror: {doubleteam: {evasion: 2}, flash: {accuracy: -2}},
 burning: {smokescreen: {accuracy: -2}},
 desert: {sandattack: {accuracy: -2}},
 darkcrystalcavern: {flash: {accuracy: -2}},
  electerrain: {charge: {spd: 2}, eerieimpulse: {spa: -3}},
  "grassy": {
    "coil": {
      "atk": 2,
      "accuracy": 2,
      "def": 2
    },
    "growth": {
      "atk": 2,
      "spa": 2
    }
  },
  "bigtop": {
    featherdance: {atk: -3},
    "dragondance": {
      "atk": 2,
      "spe": 2
    },
    "quiverdance": {
      "spa": 2,
      "spd": 2,
      "spe": 2
    },
    "swordsdance": {
      "atk": 3
    }
  },
  "forest": {
    "growth": {
      "atk": 2,
      "spa": 2
    },
    "defendorder": {
      "spd": 2,
      "def": 2
    }
  },
  "flowergarden1": {
    "growth": {
      "atk": 2,
      "spa": 2
    }
  },
  "flowergarden2": {
    "growth": {
      "atk": 2,
      "spa": 2
    }
  },
  "flowergarden3": {
    "growth": {
      "atk": 3,
      "spa": 3
    }
  },
  "flowergarden4": {
    "growth": {
      "atk": 3,
      "spa": 3
    }
  },
  "flowergarden5": {
    "growth": {
      "atk": 3,
      "spa": 3
    }
  },
  "misty": {
    "aromaticmist": {"spd": 2},
    "sweetscent": {"evasion": -2, "def": -1, "spd": -1},
    "cosmicpower": {
      "spd": 2,
      "def": 2
    }
  },
  "rainbow": {
    meditate: {atk: 3},
    "cosmicpower": {
      "spd": 2,
      "def": 2
    }
  },
  "holy": {
    "cosmicpower": {
      "spd": 2,
      "def": 2
    }
  },
  "starlight": {
    flash: {accuracy: -2},
    "cosmicpower": {
      "spd": 2,
      "def": 2
    }
  },
  "newworld": {
    flash: {accuracy: -2},
    "cosmicpower": {
      "spd": 2,
      "def": 2
    }
  },
  "psyterrain": {
    "kinesis": {"accuracy": -2},
    "meditate": {"atk": 2, "spa": 2},
    "cosmicpower": {
      "spd": 2,
      "def": 2
    },
    "calmmind": {
      "spa": 2,
      "spd": 2
    },
    "nastyplot": {
      "spa": 3
    }
  },
  "chess": {
    "calmmind": {
      "spa": 2,
      "spd": 2
    },
    "nastyplot": {
      "spa": 3
    }
  },
  ashenbeach: {
    calmmind: {spa: 2, spd: 2}, kinesis: {accuracy: -2}, meditate: {atk: 3}, sandattack: {accuracy: -2},
  },
  "fairytale": {
    "swordsdance": {
      "atk": 3
    },
    "acidarmor": {
      "def": 3
    },
    "nobleroar": {
      "atk": -2,
      "spa": -2
    }
  },
  "corrosive": {
    "acidarmor": {
      "def": 3
    }
  },
  "corrosivemist": {
    "acidarmor": {
      "def": 3
    },
    "smokescreen": {
      "accuracy": -2
    }
  },
  "murkwatersurface": {
    "acidarmor": {
      "def": 3
    }
  },
  "factory": {
    metalsound: {spd: -3},
    shiftgear: {atk: 2, spe: 2},
    "irondefense": {
      "def": 3
    },
    "autotomize": {
      "spe": 3
    }
  },
  shortcircuit: {metalsound: {spd: -3}, flash: {accuracy: -2}},
  "rocky": {
    "rockpolish": {
      "spe": 3
    }
  },
  "crystalcavern": {
    "rockpolish": {
      "spe": 2,
      "atk": 1,
      "spa": 1
    }
  }
};
