import {
  extractSingleParams,
  isFirstCharValid,
  parseFloatAndValidate,
} from "./util/params.js";

import proj4 from "proj4";
// Définir les systèmes de référence de coordonnées
proj4.defs(
  "EPSG:3163",
  "+proj=lcc +lat_0=-21.5 +lon_0=166 +lat_1=-20.6666666666667 +lat_2=-22.3333333333333 +x_0=400000 +y_0=300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
);
proj4.defs(
  "EPSG:3857",
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

function convertRGNCToWGS84(x, y) {
  // Créer les coordonnées source et cible
  const source = new proj4.Proj("EPSG:3163");
  const target = new proj4.Proj("EPSG:4326");

  // Effectuer la transformation
  const result = proj4(source, target, [x, y]);

  // Retourner les coordonnées en longitude et latitude
  return { longitude: result[0], latitude: result[1] };
}
function convertMercatorToWGS84(x, y) {
  // Créer les coordonnées source et cible
  const source = new proj4.Proj("EPSG:3857");
  const target = new proj4.Proj("EPSG:4326");

  // Effectuer la transformation
  const result = proj4(source, target, [x, y]);

  // Retourner les coordonnées en longitude et latitude
  return { longitude: result[0], latitude: result[1] };
}
function reprojectPoint(point, outWkid){
  if(!outWkid || [3163, 3857, '3163', '3857', 102100, '102100'].indexOf(outWkid) == -1){
    return point;
  }
  if(outWkid == 102100) outWkid = 3857;
  const source = new proj4.Proj("EPSG:4326");
  const target = new proj4.Proj("EPSG:"+outWkid);
  // Effectuer la transformation
  const result = proj4(source, target, [point.x, point.y]);

  // Retourner les coordonnées en longitude et latitude
  return { x: result[0], y: result[1] };
}

export function isTerrValid(terr) {
  if (/^\d{5}$/.test(terr)) {
    return true;
  }

  return false;
}

const FIND_PARAMS = {
  indexes: {
    nameInQuery: "category",
    type: "custom",
    array: true,
    required: false,
    extract(v) {
      if (!v) {
        return ["address", "poi", "cadastre"];
      }
      if (!Array.isArray(v)) {
        v = v.split(",");
      }
      v = v.map((v) => {
        if (v == "Address") return "address";
        if (v == "PointOfInterest") return "poi";
        if (v == "Cadastre") return "cadastre";
      });
      // On retourne les valuers uniques (suprpession doublon)
      const uniqueObject = {};
      return v.filter((value) => {
        if (!uniqueObject[value]) {
          uniqueObject[value] = true;
          return true;
        }
        return false;
      });
    },
    allowedValues: [
      "Address",
      "PointOfInterest",
      "Cadastre",
      "address",
      "poi",
      "cadastre",
    ],
    defaultValue: ["address", "poi", "cadastre"],
    description: "index de recherche",
    example: "address,poi,cadastre",
  },

  searchgeom: {
    type: "object",
    operation: "reverse",
    description:
      "géométrie de recherche par intersection spatiale. Les géométries autorisées sont : Point, LineString, Polygon et Circle. LineString et Point sont inopérants pour l’index address.",
    example:
      '{"type":"Polygon","coordinates":[[[2.354550,48.837961],[2.354550,48.839232],[2.357211,48.839232],[2.357211,48.837961],[2.354550,48.837961]]]}',
  },

  q: {
    nameInQuery: "SingleLine",
    type: "string",
    validate(v) {
      if (v.length < 3 || v.length > 200) {
        throw new Error(
          "must contain between 3 and 200 chars and start with a number or a letter"
        );
      }
    },
    operation: "search",
    description: "Chaîne décrivant la localisation à rechercher",
    example: "127 rue Daly",
  },

  limit: {
    nameInQuery: "maxLocations",
    type: "integer",
    defaultValue: 10,
    validate(v) {
      if (v < 1 || v > 20) {
        throw new Error("must be an integer between 1 and 20");
      }
    },
    description: "nombre maximum de candidats retournés",
    example: "5",
  },

  lon: {
    type: "float",
    validate(v) {
      if (v < -180 || v > 180) {
        throw new Error("must be a float between -180 and 180");
      }
    },
    description:
      "longitude d’un localisant pour favoriser les candidats les plus proches",
    example: "2.327640",
  },

  lat: {
    type: "float",
    validate(v) {
      if (v < -90 || v > 90) {
        throw new Error("must be a float between -90 and 90");
      }
    },
    description:
      "latitude d’un localisant pour favoriser les candidats les plus proches",
    example: "48.835187",
  },

  type: {
    type: "string",
    allowedValues: ["housenumber", "street", "locality", "municipality"],
    description:
      "filtre pour l’index address. Il permet de filtrer par type de données adresse : numéro de maison, rue, commune, ...",
    example: "municipality",
  },

  postcode: {
    nameInQuery: "postal",
    type: "string",
    validate(v) {
      if (!/^\d{5}$/.test(v)) {
        throw new Error("must contain 5 digits");
      }
    },
    description:
      "filtre pour index address uniquement. Il permet de filtrer les résultats par code postal",
    example: "98800",
  },

  citycode: {
    type: "string",
    validate(v) {
      if (!/^(\d{5}|\d[AB]\d{3})$/.test(v)) {
        throw new Error("not valid");
      }
    },
    description:
      "filtre pour les index address et poi. Il permet de filtrer les résultats par code INSEE",
    example: "98818",
  },

  city: {
    type: "string",
    validate(v) {
      if (v.length > 50) {
        throw new Error("must contain between 1 and 50 chars");
      }
    },
    description:
      "filtre pour les index address et poi. Il permet de filtrer par nom de commune",
    example: "KONE",
  },

  returntruegeometry: {
    type: "boolean",
    defaultValue: false,
    description: "indique si la vraie géométrie doit être retournée",
    example: "false",
  },

  autocomplete: {
    type: "boolean",
    defaultValue: true,
    description:
      "indique si la recherche doit être réalisée en mode auto-complétion. Pertinent uniquement pour la saisie en direct d'utilisateurs",
    example: "false",
  },
};

const REVERSE_PARAMS = {
  indexes: {
    nameInQuery: "category",
    type: "custom",
    array: true,
    required: false,
    extract(v) {
      if (!v) {
        return ["address", "poi", "cadastre"];
      }
      if (!Array.isArray(v)) {
        v = v.split(",");
      }
      v = v.map((v) => {
        if (v == "Address") return "address";
        if (v == "PointOfInterest") return "poi";
        if (v == "Cadastre") return "cadastre";
      });
      // On retourne les valuers uniques (suprpession doublon)
      const uniqueObject = {};
      return v.filter((value) => {
        if (!uniqueObject[value]) {
          uniqueObject[value] = true;
          return true;
        }
        return false;
      });
    },
    allowedValues: [
      "Address",
      "PointOfInterest",
      "Cadastre",
      "address",
      "poi",
      "cadastre",
    ],
    defaultValue: ["address", "poi", "cadastre"],
    description: "index de recherche",
    example: "address,poi,cadastre",
  },

  searchgeom: {
    type: "object",
    operation: "reverse",
    description:
      "géométrie de recherche par intersection spatiale. Les géométries autorisées sont : Point, LineString, Polygon et Circle. LineString et Point sont inopérants pour l’index address.",
    example:
      '{"type":"Polygon","coordinates":[[[2.354550,48.837961],[2.354550,48.839232],[2.357211,48.839232],[2.357211,48.837961],[2.354550,48.837961]]]}',
  },

  limit: {
    nameInQuery: "maxLocations",
    type: "integer",
    defaultValue: 10,
    validate(v) {
      if (v < 1 || v > 20) {
        throw new Error("must be an integer between 1 and 20");
      }
    },
    description: "nombre maximum de candidats retournés",
    example: "5",
  },

  lon: {
    type: "float",
    validate(v) {
      if (v < -180 || v > 180) {
        throw new Error("must be a float between -180 and 180");
      }
    },
    description:
      "longitude d’un localisant pour favoriser les candidats les plus proches",
    example: "2.327640",
  },

  lat: {
    type: "float",
    validate(v) {
      if (v < -90 || v > 90) {
        throw new Error("must be a float between -90 and 90");
      }
    },
    description:
      "latitude d’un localisant pour favoriser les candidats les plus proches",
    example: "48.835187",
  },

  type: {
    type: "string",
    allowedValues: ["housenumber", "street", "locality", "municipality"],
    description:
      "filtre pour l’index address. Il permet de filtrer par type de données adresse : numéro de maison, rue, commune, ...",
    example: "municipality",
  },

  postcode: {
    nameInQuery: "postal",
    type: "string",
    validate(v) {
      if (!/^\d{5}$/.test(v)) {
        throw new Error("must contain 5 digits");
      }
    },
    description:
      "filtre pour index address uniquement. Il permet de filtrer les résultats par code postal",
    example: "98800",
  },

  citycode: {
    type: "string",
    validate(v) {
      if (!/^(\d{5}|\d[AB]\d{3})$/.test(v)) {
        throw new Error("not valid");
      }
    },
    description:
      "filtre pour les index address et poi. Il permet de filtrer les résultats par code INSEE",
    example: "98818",
  },

  city: {
    type: "string",
    validate(v) {
      if (v.length > 50) {
        throw new Error("must contain between 1 and 50 chars");
      }
    },
    description:
      "filtre pour les index address et poi. Il permet de filtrer par nom de commune",
    example: "KONE",
  },

  returntruegeometry: {
    type: "boolean",
    defaultValue: false,
    description: "indique si la vraie géométrie doit être retournée",
    example: "false",
  },

  autocomplete: {
    type: "boolean",
    defaultValue: true,
    description:
      "indique si la recherche doit être réalisée en mode auto-complétion. Pertinent uniquement pour la saisie en direct d'utilisateurs",
    example: "false",
  },
};


const parseLocation = (v) => {
  if(!v) return null;
  if (v && v.startsWith("{")) {
    const point = JSON.parse(v);
    if (point.longitude) {
      return [point.longitude, point.latitude];
    }
    if (point.spatialReference.wkid == 4326) {
      return [point.x, point.y];
    }
    // On doit reprojeter
    if (
      point.spatialReference.wkid == 102100 ||
      point.spatialReference.latestWkid == 3857
    ) {
      const lonlat = convertMercatorToWGS84(point.x, point.y);
      return [lonlat.longitude, lonlat.latitude];
    }
    if (point.spatialReference.wkid == 3163) {
      const lonlat = convertRGNCToWGS84(point.x, point.y);
      return [lonlat.longitude, lonlat.latitude];
    }
    return null;
  }
  const coordinates = v.split(",");

  if (coordinates.length !== 2) {
    throw new Error('must be in the format "lon,lat"');
  }

  const lon = parseFloatAndValidate(coordinates[0]);
  const lat = parseFloatAndValidate(coordinates[1]);

  return [lon, lat];
}

const AUTOCOMPLETE_PARAMS = {
  text: {
    type: "string",
    required: true,
    validate(v) {
      if (v.length < 3 || v.length > 200 || !isFirstCharValid(v)) {
        throw new Error(
          "must contain between 3 and 200 chars and start with a number or a letter"
        );
      }
    },
    description: "le texte devant être completé",
    example: "10 ru",
  },

  terr: {
    type: "string",
    array: true,
    validate(v) {
      if (v.some((value) => !isTerrValid(value))) {
        throw new Error("unexpected value");
      }
    },
    description:
      "une limitation de la zone de recherche de localisants. Les valeurs acceptés sont les codes communes (INSEE).",
    example: "98818",
  },

  poiType: {
    type: "string",
    description: "filtre sur le localisant pour le type de POI",
    example: "administratif",
  },

  lonlat: {
    type: "custom",
    extract:parseLocation,
    description: "coordonnées (longitude, latitude) d'un localisant pour favoriser les candidats les plus proches",
    example: "166.5,-22",
    nameInQuery: "location",
  },

  type: {
    type: "string",
    array: true,
    allowedValues: ["PositionOfInterest", "StreetAddress", "Cadastre"],
    defaultValue: ["PositionOfInterest", "StreetAddress", "Cadastre"],
    description:
      "le type de localisant recherché, il est possible de spécifier plusieurs types séparés par une virgule",
    example: "PositionOfInterest",
    nameInQuery: "category",
  },

  maximumResponses: {
    type: "integer",
    defaultValue: 10,
    validate(v) {
      if (v < 1 || v > 15) {
        throw new Error("must be an integer between 1 and 15");
      }
    },
    description:
      "le nombre maximum de réponses que l'on souhaite voir retournées",
    example: "6",
    nameInQuery: "maxSuggestions",
  },

  bbox: {
    type: "custom",
    extract(v) {
      const coordinates = v.split(",");

      if (coordinates.length !== 4) {
        throw new Error('must be in the format "xmin,ymin,xmax,ymax"');
      }

      const xmin = parseFloatAndValidate(coordinates[0]);
      const ymin = parseFloatAndValidate(coordinates[1]);
      const xmax = parseFloatAndValidate(coordinates[2]);
      const ymax = parseFloatAndValidate(coordinates[3]);

      return [xmin, ymin, xmax, ymax];
    },
    validate(v) {
      validateBbox(v);
    },
    description: "filtre avec une bbox suivant l'ordre xmin, ymin, xmax, ymax",
    example:
      "48.573569106948469,27.837770518544438,48.417446881093412,27.381161181879751",
  },
  nameInQuery: "searchExtent",
};


export const esri_responses = {
  services: {
    currentVersion: 11.4,
    folders: [],
    services: [
      {
        name: "localisations",
        type: "GeocodeServer",
      },
    ],
  },
  service: {
    currentVersion: 11.4,
    serviceDescription: "Localisations de Nouvelle-Calédonie",
    singleLineAddressField: {
      name: "SingleLine",
      type: "esriFieldTypeString",
      alias: "Single Line Input",
      required: false,
      length: 300,
      /*localizedNames: {
        en: "Single Line Input",
        fr: "Entrée uniligne",
        "fr-fr": "Adresse ligne unique",
      },
      recognizedNames: {
        en: ["FullAddress", "SingleLine"],
        fr: ["Adresse seule ligne", "Adresse ligne unique"],
        "fr-fr": ["Adresse ligne unique"],
      },*/
    },
    addressFields: [
      {
        name: "Address",
        type: "esriFieldTypeString",
        alias: "Address or Place",
        required: false,
        length: 150,
        localizedNames: {
          en: "Address or Place",
          fr: "Adresse ou lieu",
          "fr-fr": "Adresse ou lieu",
        },
        recognizedNames: {
          en: ["Address", "Street", "Street Address"],
          fr: ["Adresse", "Rue"],
          "fr-fr": ["Adresse"],
        },
      },
      {
        name: "Address2",
        type: "esriFieldTypeString",
        alias: "Address2",
        required: false,
        length: 150,
        localizedNames: {
          en: "Address2",
          fr: "Adresse2",
          "fr-fr": "Adresse2",
        },
        recognizedNames: {
          en: ["Address2"],
          fr: ["Adresse 2", "Rue"],
          "fr-fr": ["Adresse 2"],
        },
      },
      {
        name: "Neighborhood",
        type: "esriFieldTypeString",
        alias: "Neighborhood",
        required: false,
        length: 100,
        localizedNames: {
          en: "Neighborhood",
          fr: "Zone",
        },
        recognizedNames: {
          en: ["Neighborhood"],
          fr: ["Zone", "Quartier"],
        },
      },
      {
        name: "City",
        type: "esriFieldTypeString",
        alias: "City",
        required: false,
        length: 100,
        localizedNames: {
          en: "City",
          fr: "Ville",
          "fr-fr": "Ville",
        },
        recognizedNames: {
          en: ["City"],
          fr: ["Ville"],
        },
      },
      {
        name: "Postal",
        type: "esriFieldTypeString",
        alias: "ZIP",
        required: false,
        length: 20,
        localizedNames: {
          en: "Postal",
          fr: "Postal",
          "fr-fr": "Code Postal",
        },
        recognizedNames: {
          en: ["Postal", "Zip"],
          fr: ["Code Postal", "CP"],
        },
      },
      {
        name: "CountryCode",
        type: "esriFieldTypeString",
        alias: "Country",
        required: false,
        length: 100,
        localizedNames: {
          en: "Country",
          fr: "Pays",
          "fr-fr": "Code du pays",
        },
        recognizedNames: {
          en: ["CountryCode"],
          fr: ["Pays", "Code ISO"],
        },
      },
    ],
    candidateFields: [
      {
        name: "id",
        type: "esriFieldTypeString",
        alias: "Identifiant",
        required: true,
        length: 100,
      },
      {
        name: "Shape",
        type: "esriFieldTypeGeometry",
        alias: "Shape",
        required: true,
      },
      {
        name: "label",
        type: "esriFieldTypeString",
        alias: "Libellé",
        required: true,
        length: 300,
      },
      {
        name: "name",
        type: "esriFieldTypeString",
        alias: "Nom",
        required: true,
        length: 300,
      },
      {
        name: "index",
        type: "esriFieldTypeString",
        alias: "Index",
        required: true,
        length: 50,
      },
      {
        name: "type",
        type: "esriFieldTypeString",
        alias: "Type",
        required: false,
        length: 100,
      },
      {
        name: "poscode",
        type: "esriFieldTypeString",
        alias: "Code postal",
        required: false,
        length: 5,
      },
      {
        name: "city",
        type: "esriFieldTypeString",
        alias: "Commune",
        required: true,
        length: 100,
      },
      {
        name: "citycode",
        type: "esriFieldTypeString",
        alias: "Code Insee",
        required: true,
        length: 5,
      },
      {
        name: "source",
        type: "esriFieldTypeString",
        alias: "Source",
        required: false,
        length: 100,
      },
      {
        name: "score",
        type: "esriFieldTypeDouble",
        alias: "Score",
        required: true,
      },
      {
        name: "country",
        type: "esriFieldTypeString",
        alias: "Code Pays",
        required: true,
        length: 3,
      },
      {
        name: "langCode",
        type: "esriFieldTypeString",
        alias: "Code Langue",
        required: true,
        length: 3,
      },
      {
        name: "distance",
        type: "esriFieldTypeDouble",
        alias: "Distance",
        required: false,
      },
    ],
    categories: [
      {
        name: "Address",
        localizedNames: {
          en: "Address",
          fr: "Adresse",
        },
      },
      {
        name: "PointOfInterest",
        localizedNames: {
          en: "Point Of Interest",
          fr: "Point d'interêt",
        },
      },
      {
        name: "Cadastre",
        localizedNames: {
          en: "Cadastre",
          fr: "Parcelle cadastrale",
        },
      },
    ],
    spatialReference: {
      wkid: 4326,
      latestWkid: 4326,
    },
    locatorProperties: {
      MinimumCandidateScore: "70",
      UICLSID: "{AE5A3A0E-F756-11D2-9F4F-00C04F8ED1C4}",
      MinimumMatchScore: "75",
      IntersectionConnectors: "& @ | and",
      SuggestedBatchSize: 1,
      MaxBatchSize: 1,
      LoadBalancerTimeOut: 60,
      isAGOWorldLocator: false,
      WriteXYCoordFields: "FALSE",
      WriteStandardizedAddressField: "FALSE",
      WriteReferenceIDField: "FALSE",
      WritePercentAlongField: "FALSE",
      LocatorVersion: "11.0",
      supportsBatchOutFields: "False",
    },
    countries: ["NC"],
    capabilities: "Geocode,ReverseGeocode,Suggest",
  },
  info: {
    currentVersion: 11.3,
    fullVersion: "11.3.0",
  },
};

export const getSearchParamsInEsriGeocode = (query) => {
  const location = parseLocation(query.location);
  if(location){
    query.lon = ''+location[0];
    query.lat = ''+location[1];
  }
  // Patch pour widget itinéraire
  if(query["Single Line Input"]){
    query["SingleLine"] = query["Single Line Input"];
  }
  // Patch pour widget itinéraire
  if(query["magicKey"]){
    query["SingleLine"] = query["magicKey"];
  }
  return extractSingleParams(query, FIND_PARAMS);
};

export const getReverseParamsInEsriGeocode = (query) => {
  const location = parseLocation(query.location);
  if(location){
    query.lon = ''+location[0];
    query.lat = ''+location[1];
  }
  query.limit = 1;
  return extractSingleParams(query, REVERSE_PARAMS);
};

export const getOutSr = (query) => {
  // NB : on ne gère pas le 4326 dans cette fonction car pas de reprojection nécessaire dans ce cas.
  let outSr = query.outSr || query.outSR || null;
  if(!outSr) return null;

  if(outSr == 3857 || outSr == 102100) return 3857;
  if(outSr == 3163) return 3163;


  if(isNaN(outSr)){
    outSr = JSON.parse(outSr);
    if(outSr.wkid == 3857 || outSr.wkid == 102100 || outSr.latestWkid == 102100) return 3857;
    if(outSr.wkid == 3163) return 3163;
  }


  return null
}

export const getSuggestsParamsInEsriGeocode = (query) => {
  return extractSingleParams(query, AUTOCOMPLETE_PARAMS);
};
const _properties2CandidateAttributes = (properties) => {
  return {
    id: properties.id,
    label: properties.label || properties.name,
    name: properties.toponym || properties.name,
    index: properties._type,
    type: properties.type || properties.category,

    postcode: properties.postcode,
    city: properties.city,
    citycode: properties.citycode || null,
    source: properties.source || null,

    score: properties.score,
    country: "NCL",
    langCode: "FRE",
    distance: properties.distance || null,
  };
};
const _properties2ReverseAttributes = (properties) => {
  return {
    id: properties.id,
    label: properties.label || properties.name,
    name: properties.toponym || properties.name,
    index: properties._type,
    type: properties.type || properties.category,

    postcode: properties.postcode,
    city: properties.city,
    citycode: properties.citycode || null,
    source: properties.source || null,

    score: properties.score,
    country: "NCL",
    langCode: "FRE",
    distance: properties.distance || null,
  };
};

const _feature2Location = (feature, outWkid, includeSr) => {
  let point = {
    x: feature.geometry.coordinates[0],
    y: feature.geometry.coordinates[1],
  };
  if(outWkid && outWkid != 4326){
    // si x et y RGNC sont dans les attributs on récupère
    point = reprojectPoint(point, outWkid)
  }
  if(includeSr){
    point.spatialReference = _getSpatialReference(outWkid)
  }
  return point;
}

const _feature2Candidate = (feature, outWkid) => {
  let point = _feature2Location(feature, outWkid, false);
  const extent_const = (outWkid && outWkid == 4326) ?  0.0001 : 100;
  return {
    address: feature.properties.label || feature.properties.name,
    location: point,
    score: feature.properties.score || feature.properties._score,
    attributes: _properties2CandidateAttributes(feature.properties),
    extent: {
      xmin: point.x - extent_const,
      ymin: point.y - extent_const,
      xmax: point.x + extent_const,
      ymax: point.y + extent_const,
    }
  };
};
const _feature2suggest = (result) => {
  return {
    text: result.fulltext,
    magicKey: result.fulltext,
    isCollection: false,
  };
};

const _getSpatialReference = (outWkid) => {
  let wkid = outWkid || 4326;
  let latestWkid = outWkid || 4326;
  if(latestWkid == 3857) latestWkid = 102100;
  return {
      wkid,
      latestWkid,
  };
}

export const searchResult2Candidates = (features, outWkid) => {
  return {
    spatialReference: _getSpatialReference(outWkid),
    candidates: features.map((f)=>{return _feature2Candidate(f, outWkid)}),
  };
};
export const reverseResult2Adress = (features, outWkid) => {
  const feature = features[0];
  const location = _feature2Location(feature, outWkid, true);

  return {
    address:_properties2ReverseAttributes(feature.properties),
    location
  }
};

export const searchResult2Suggests = (results) => {
  return {
    suggestions: results.map(_feature2suggest),
  };
};
