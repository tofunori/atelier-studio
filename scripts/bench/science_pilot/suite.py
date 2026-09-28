"""Synthetic diagnostic cases. These fixtures are not scientific evidence."""
import csv
import io
import json

VERSION = "science-pilot-v1"

COMMON = """Tu travailles dans un dossier d'essai isolé. Tous les documents et toutes les
données sont fictifs, créés pour un diagnostic logiciel. Utilise uniquement les
fichiers de ce dossier, sans réseau ni sous-agent. Ne lis pas les dossiers parents,
les configurations, les identifiants ou d'autres projets. Préserve les fichiers
d'entrée. Écris les livrables demandés dans ce dossier. Chaque script demandé doit
être autonome, sans dépendance à un autre fichier de code produit pendant l'essai.
Python est disponible avec
numpy, pandas, matplotlib et Pillow. Ne fais aucune installation. Termine lorsque
les fichiers sont prêts; garde ta réponse finale courte.
"""

PROCEDURE = """Procédure scientifique supplémentaire à appliquer à cette demande :
1. Identifie les livrables et les critères de réussite dans la demande avant de travailler.
2. Vérifie l'entité, la période, les unités, les filtres et la provenance des données utilisées.
3. Choisis la méthode correspondant exactement à la question; distingue valeurs absolues,
   changements relatifs, estimations, observations et données absentes.
4. Pour un calcul, enregistre un script qui relit les entrées puis exécute-le. Vérifie les
   résultats sur les fichiers finaux, avec un recalcul simple ou un cas limite pertinent.
5. Vérifie les citations contre le passage exact. N'utilise pas un résumé comme citation.
6. Pour une interprétation, garde les incertitudes, les limites spatiales/temporelles et
   la distinction entre association et causalité. Une preuve manquante reste manquante.
7. Vérifie que tous les livrables existent et correspondent à leur contenu annoncé.
Adapte ces étapes à la tâche et au temps disponible, sans vérifications sans rapport.
"""


def table(rows):
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return out.getvalue()


def case(id, title, prompt, files, expected, script=None, mutation=None):
    return dict(id=id, title=title, prompt=prompt, files=files, expected=expected,
                script=script, mutation=mutation)


def cases():
    sources = {
        "S1.txt": "Source fictive S1. Glacier Haig. Page 4.\nLa baisse d'albédo estimée est de 0,06 pour le glacier Haig entre les deux périodes.\n",
        "S2.txt": "Source fictive S2. Station voisine de Peyto, hors glacier. Page 7.\nLa station voisine montre une baisse d'albédo de 0,09.\n",
        "S3.txt": "Source fictive S3. Glacier Peyto, pixels du glacier. Page 12.\nLa baisse d'albédo estimée est de 0,04 pour les pixels du glacier Peyto.\n",
    }
    weighted = table([['zone','area_km2','before','after'],['A',1,.7,.6],['B',3,.7,.67],['C',6,.7,.68]])
    weighted2 = table([['zone','area_km2','before','after'],['A',2,.8,.6],['B',2,.5,.6],['C',1,.6,.6]])
    daily = table([
        ['date','albedo','qa','revision'], ['2020-06-01',.6,0,1], ['2020-06-01',.7,0,2],
        ['2020-07-01',.6,0,1], ['2020-08-01',.2,1,1], ['2020-09-01',.1,0,1],
        ['2021-06-01','NA',0,1], ['2021-07-01',.55,0,1], ['2021-08-01',.9,1,1],
    ])
    daily2 = daily.replace('2020-07-01,0.6,', '2020-07-01,0.5,').replace('2021-07-01,0.55,','2021-07-01,0.45,')
    trend = table([['year','albedo'],[2000,.72],[2002,.70],[2005,.67],[2010,.62]])
    trend2 = table([['year','albedo'],[2000,.70],[2002,.72],[2005,.75],[2010,.80]])
    return [
        case('01_exact_source', 'Entité et citation exacte',
             'Trouve dans les sources la baisse estimée pour les pixels du glacier Peyto lui-même. '
             'Écris answer.json avec source_id, page (entier), quote (phrase exacte), '
             'decline_albedo (amplitude positive) et is_proxy (booléen).', sources,
             {'source_id':'S3','page':12,'quote':"La baisse d'albédo estimée est de 0,04 pour les pixels du glacier Peyto.", 'decline_albedo':.04,'is_proxy':False}),
        case('02_missing_evidence', 'Mesure absente',
             'Les sources permettent-elles de donner la masse de cendres déposée ? Écris answer.json avec '
             'mass_measured (booléen), mass_kg_m2 (nombre ou null), observed_quantity '
             '(albedo|ash_mass), inferred_quantity (radiative_anomaly|ash_mass), source_id et '
             'explanation (une phrase).',
             {'source.txt':"Source fictive A. Les observations satellitaires montrent un albédo plus faible après l'incendie. Une anomalie radiative attribuée à cet événement est calculée à partir de l'albédo et du rayonnement incident. Aucun prélèvement ni mesure de masse de cendres n'a été réalisé.\n"},
             {'mass_measured':False,'mass_kg_m2':None,'observed_quantity':'albedo','inferred_quantity':'radiative_anomaly','source_id':'A'}),
        case('03_albedo_units', 'Absolu, points et relatif',
             'L’albédo passe de 0.72 à 0.63. Écris answer.json avec signed_change_albedo, '
             'signed_change_percentage_points et relative_change_percent. Respecte le signe après moins avant.', {},
             {'signed_change_albedo':-.09,'signed_change_percentage_points':-9,'relative_change_percent':-12.5}),
        case('04_area_weighting', 'Pondération spatiale reproductible',
             'Calcule la variation moyenne d’albédo après moins avant, pondérée par la superficie. '
             'Écris analyze.py, qui relit zones.csv et écrit answer.json avec weighted_change_albedo '
             'et total_area_km2. Le script doit fonctionner si les valeurs du CSV changent.',
             {'zones.csv':weighted}, {'weighted_change_albedo':-.031,'total_area_km2':10}, 'analyze.py',
             {'files':{'zones.csv':weighted2},'expected':{'weighted_change_albedo':-.04,'total_area_km2':5}}),
        case('05_radiative_energy', 'Conversion énergie et fonte équivalente',
             'L’albédo passe de 0.70 à 0.62 sous 350 W/m² constants pendant 6 heures. '
             'Calcule le surplus d’énergie absorbée et son équivalent en eau de fonte si toute cette '
             'énergie servait à fondre la glace. Chaleur latente : 334000 J/kg; 1 kg/m² = 1 mm. '
             'Écris calculate.py et answer.json avec extra_flux_W_m2, energy_MJ_m2, '
             'equivalent_melt_mm, is_observed_melt (booléen).', {},
             {'extra_flux_W_m2':28,'energy_MJ_m2':.6048,'equivalent_melt_mm':.6048e6/334000,'is_observed_melt':False}, 'calculate.py'),
        case('06_quality_filter', 'Filtres, doublons et valeurs absentes',
             'Calcule la moyenne JJA par année à partir de daily.csv. Pour chaque date, conserve '
             'd’abord la révision la plus élevée, puis uniquement juin-juillet-août, qa=0 et albédo '
             'numérique fini. Ne transforme pas NA en zéro. Écris analyze.py et answer.json '
             'contenant means et counts (objets indexés par année). Le script relit le CSV à chaque exécution.',
             {'daily.csv':daily}, {'means':{'2020':.65,'2021':.55},'counts':{'2020':2,'2021':1}}, 'analyze.py',
             {'files':{'daily.csv':daily2},'expected':{'means':{'2020':.60,'2021':.45},'counts':{'2020':2,'2021':1}}}),
        case('07_uncertain_paragraph', 'Estimation et prudence causale',
             'Réécris en anglais le paragraphe de draft.txt en restant strictement fidèle à results.txt. '
             'Écris answer.json avec paragraph, estimate_albedo, interval95 (liste de deux nombres), '
             'excludes_zero (booléen), causal_identification (booléen) et quantity_kind (estimated|observed).',
             {'draft.txt':'Wildfires caused a significant 2% decline in glacier albedo. Satellite observations prove this effect.\n',
              'results.txt':'Étude fictive observationnelle. Association estimée par le modèle : -0.02 unité d’albédo, intervalle crédible 95% [-0.04, 0.01]. Aucun dispositif d’identification causale. Les observations satellitaires alimentent le modèle; le coefficient est estimé.\n'},
             {'estimate_albedo':-.02,'interval95':[-.04,.01],'excludes_zero':False,'causal_identification':False,'quantity_kind':'estimated'}),
        case('08_measured_figure', 'Figure issue des données',
             'Produis une figure de l’albédo en fonction de l’année à partir de series.csv. '
             'Écris plot.py qui relit le CSV, utilise matplotlib et enregistre figure.png '
             '(600 × 400 pixels exactement, sans recadrage), avec axes Year et Albedo (dimensionless). '
             'Exporte aussi plotted.csv avec les colonnes year,albedo réellement tracées, dans l’ordre '
             'croissant des années, et answer.json avec n_points et data_source. Le script doit '
             'fonctionner si les valeurs du CSV changent.', {'series.csv':trend},
             {'n_points':4,'data_source':'series.csv'}, 'plot.py',
             {'files':{'series.csv':trend2},'expected':{'n_points':4,'data_source':'series.csv'}}),
        case('09_irregular_trend', 'Pente et temps irrégulièrement espacés',
             'Ajuste une droite par moindres carrés avec intercept à series.csv, en utilisant '
             'les années réelles comme variable explicative. Écris analyze.py qui relit le CSV '
             'et answer.json avec slope_albedo_per_year, slope_percentage_points_per_decade '
             'et n. Le script doit fonctionner si les valeurs du CSV changent.', {'series.csv':trend},
             {'slope_albedo_per_year':-.01,'slope_percentage_points_per_decade':-10,'n':4}, 'analyze.py',
             {'files':{'series.csv':trend2},'expected':{'slope_albedo_per_year':.01,'slope_percentage_points_per_decade':10,'n':4}}),
        case('10_temporal_leakage', 'Choix de méthode sans fuite temporelle',
             'Choisis une méthode pour prévoir une nouvelle année à partir des rapports. '
             'Écris answer.json avec selected_model, rejected_model, reason_code '
             '(temporal_leakage|higher_validation_error) et test_set_used_for_selection (booléen). '
             'Tu ne dois pas utiliser le jeu de test final pour choisir la méthode.',
             {'reports.json':json.dumps({'A':{'validation_rmse':.035,'split':'train<=2018, validation=2019','preprocessing':'fit on train only'},
                                        'B':{'validation_rmse':.020,'split':'random days across 2010-2019','preprocessing':'uses a centered 31-day filter including future observations'},
                                        'final_test':{'period':'2020-2022','status':'sealed, no score supplied'}})},
             {'selected_model':'A','rejected_model':'B','reason_code':'temporal_leakage','test_set_used_for_selection':False}),
    ]
