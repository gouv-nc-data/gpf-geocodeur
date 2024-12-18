# coding: utf-8

import geopandas as gpd
import pandas as pd
import requests

COMMUNES = [line.split("\t") for line in """98801	BELEP
98802	BOULOUPARI
98802	BOULOUPARIS
98803	BOURAIL
98804	CANALA
98805	DUMBEA
98806	FARINO
98807	HIENGHENE
98808	HOUAILOU
98809	ILE DES PINS
98810	KAALA GOMEN
98811	KONE
98812	KOUMAC
98813	LA FOA
98814	LIFOU
98815	MARE
98816	MOINDOU
98817	MONT DORE
98818	NOUMEA
98819	OUEGOA
98820	OUVEA
98821	PAITA
98822	POINDIMIE
98823	PONERIHOUEN
98824	POUEBO
98825	POUEMBOUT
98826	POUM
98827	POYA
98828	SARRAMEA
98829	THIO
98830	TOUHO
98831	VOH
98832	YATE
98833	KOUAOUA""".split("\n")]


def get_geodf_from_featureservice(feature_layer_url, limit=None):
    if not limit:
        limit = 1000
    all_features = []
    offset = 0

    while True:
        params = {
            'where': '1=1',  # Condition pour récupérer toutes les entités
            'outFields': '*',  # Récupérer tous les champs
            'f': 'geojson',  # Format GeoJSON
            'resultOffset': offset,  # Offset pour la pagination
            'resultRecordCount': limit  # Limite des enregistrements par requête
        }

        # Effectuer la requête
        response = requests.get(feature_layer_url.rstrip("/") + "/query", params=params)

        # Vérifier que la requête a réussi
        if response.status_code == 200:
            data = response.json()  # Obtenir les données au format JSON
            all_features.extend(data['features'])  # Ajouter les résultats à la liste

            # Vérifier si moins de résultats que la limite, ce qui signifie que c'est la dernière page
            if len(data['features']) < limit:
                break

            # Augmenter l'offset pour la prochaine requête
            offset += limit
            # break # Temporaire pour DEBUG !
        else:
            raise Exception("Erreur lors de la récupération des données :", response.status_code)

    return gpd.GeoDataFrame.from_features(all_features)


def _compute_code_commune(value):
    if not value:
        return None
    value = value.upper().replace("-", "").replace("_", "")
    for (code, libelle) in COMMUNES:
        libelle = libelle.upper().replace("-", "").replace("_", "")
        if code == value or libelle == value:
            return code
    return None


def _compute_commune(value):
    if not value:
        return None

    input_value = "00" + str(value)
    value = "988" + input_value[-2:]
    for (code, libelle) in COMMUNES:
        if code == value:
            return libelle
    return None


def df_compute_code_comm(df, column_commune=None):
    if not column_commune:
        column_commune = "commune"
    df["code_comm"] = df[column_commune].apply(_compute_code_commune)


def df_compute_commune(df, column_code=None):
    if not column_code:
        column_code = "code_com"
    df["commune"] = df[column_code].apply(_compute_commune)


if __name__ == "__main__":
    gdf_cadastre = get_geodf_from_featureservice(
        "https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/arcgis/rest/services/cadastre_centroide/FeatureServer/0")
    print(gdf_cadastre)
    gdf_poi = get_geodf_from_featureservice(
        "https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/ArcGIS/rest/services/BDLOC/FeatureServer/13")
    print(gdf_poi)

    df_compute_code_comm(gdf_cadastre)
    print(gdf_cadastre)
    pass

    df_compute_commune(gdf_poi)
    print(gdf_poi)
