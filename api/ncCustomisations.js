/**
 * Ce module comprend les modifications NC au niveau de l'API localisations
 * Ces modifications sont injectées dans le "core" de l'API avec des modifications minimalistes
 */

export const ncModifyBeforeRequestDispatch = (indexName, params, operation, indexes, options = {}) => {
    // Si on dispatche vers le cadastre et que le 1er mot est est un nombre, on ajoute "lot " au début de la recherche pour booster les résultats
    if(indexName == 'cadastre'){
        if(params && params.q){
          const words = params.q.split(' ');
          if(!isNaN(words[0])){
            params.q = "lot " + params.q;
          }
        }
    }

    return params;
}