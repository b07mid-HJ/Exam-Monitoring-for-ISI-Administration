import pandas as pd
import sys
import json
from typing import Dict, Tuple
import math


class CalculateurSurveillances:
    """
    Calcule la répartition des surveillances d'examens par grade académique.

    Règles de hiérarchie: PR=MC=V < MA < A < AC=PES=PTC, EX=3
    Les écarts entre niveaux sont calculés automatiquement pour optimiser la répartition.
    """

    # Nombre de surveillances pour les experts
    SURVEILLANCES_EXPERTS = 4.5

    def __init__(self, nb_salles: int, profs_par_grade: Dict[str, int],
                 nb_enseignants_par_salle: int = 2, nb_creneaux_total: int = 20,
                 ecart_1_2: int = None, ecart_2_3: int = None, ecart_3_4: int = None):
        self.nb_salles = nb_salles
        self.profs_par_grade = profs_par_grade
        self.nb_enseignants_par_salle = nb_enseignants_par_salle
        self.nb_creneaux_total = nb_creneaux_total

        # Définition des niveaux hiérarchiques
        self.niveaux = {
            1: ['PR', 'MC', 'V'],  # Niveau 1: charge de base
            2: ['MA'],  # Niveau 2: base + ecart_1_2
            3: ['AS'],  # Niveau 3: base + ecart_1_2 + ecart_2_3
            4: ['AC', 'PES', 'PTC']  # Niveau 4: base + ecart_1_2 + ecart_2_3 + ecart_3_4
        }

        # Écarts entre niveaux (en heures)
        self.ecart_1_2 = ecart_1_2
        self.ecart_2_3 = ecart_2_3
        self.ecart_3_4 = ecart_3_4

    def calculer(self) -> Tuple[Dict[str, int], Dict[str, int]]:
        surveillances_par_grade = self._calculer_surveillances()
        indisponibilites_autorisees = self._calculer_indisponibilites(surveillances_par_grade)
        return surveillances_par_grade, indisponibilites_autorisees

    def _calculer_surveillances(self) -> Dict[str, float]:
        """Calcule le nombre de surveillances par grade avec écarts calculés automatiquement"""
        surveillances = {}

        # Traiter les experts séparément (en heures: 4.5 heures = 3 surveillances × 1.5h)
        if 'EX' in self.profs_par_grade:
            surveillances['EX'] = self.SURVEILLANCES_EXPERTS

        # Total de surveillances à répartir
        total_surveillances_necessaires = self.nb_salles * self.nb_enseignants_par_salle
        nb_experts = self.profs_par_grade.get('EX', 0)
        surveillances_experts = nb_experts * (self.SURVEILLANCES_EXPERTS / 1.5)  # Convertir heures en nombre de surveillances
        surveillances_restantes = total_surveillances_necessaires - surveillances_experts

        # Enseignants par niveau
        enseignants_par_niveau = {
            niveau: sum(self.profs_par_grade.get(grade, 0) for grade in grades)
            for niveau, grades in self.niveaux.items()
        }
        total_enseignants = sum(enseignants_par_niveau.values())
        if total_enseignants == 0:
            self.ecart_1_2 = self.ecart_2_3 = self.ecart_3_4 = 0
            return surveillances

        # Calcul automatique des écarts si non définis
        print(f"DEBUG: Écarts reçus - ecart_1_2: {self.ecart_1_2}, ecart_2_3: {self.ecart_2_3}, ecart_3_4: {self.ecart_3_4}", file=sys.stderr)
        N1 = enseignants_par_niveau.get(1, 0)
        N2 = enseignants_par_niveau.get(2, 0)
        N3 = enseignants_par_niveau.get(3, 0)
        N4 = enseignants_par_niveau.get(4, 0)

        # Calculer la moyenne de base (en nombre de surveillances)
        moyenne_base = surveillances_restantes / total_enseignants
        
        # Définir des écarts proportionnels (10% de la moyenne pour chaque niveau)
        # Cela garantit une différence visible entre les niveaux
        # MAIS seulement si les écarts ne sont pas déjà définis (personnalisés)
        if self.ecart_1_2 is None or self.ecart_2_3 is None or self.ecart_3_4 is None:
            ecart_unitaire = max(1, moyenne_base * 0.10)  # Au moins 1 surveillance de différence
            if self.ecart_1_2 is None:
                self.ecart_1_2 = ecart_unitaire
            if self.ecart_2_3 is None:
                self.ecart_2_3 = ecart_unitaire
            if self.ecart_3_4 is None:
                self.ecart_3_4 = ecart_unitaire
            print(f"DEBUG: Écarts calculés automatiquement: {ecart_unitaire}", file=sys.stderr)
        else:
            print(f"DEBUG: Utilisation des écarts personnalisés: {self.ecart_1_2}, {self.ecart_2_3}, {self.ecart_3_4}", file=sys.stderr)

        # Calculer la base en tenant compte des écarts
        coef_ecart1 = N2 + N3 + N4
        coef_ecart2 = N3 + N4
        coef_ecart3 = N4
        
        total_ecarts = (self.ecart_1_2 * coef_ecart1 +
                        self.ecart_2_3 * coef_ecart2 +
                        self.ecart_3_4 * coef_ecart3)
        
        surveillance_base = (surveillances_restantes - total_ecarts) / total_enseignants
        surveillance_base = max(1, surveillance_base)  # Au moins 1 surveillance

        # Répartition par niveau
        for niveau, grades in self.niveaux.items():
            if niveau == 1:
                nb_surveillances = surveillance_base
            elif niveau == 2:
                nb_surveillances = surveillance_base + self.ecart_1_2
            elif niveau == 3:
                nb_surveillances = surveillance_base + self.ecart_1_2 + self.ecart_2_3
            elif niveau == 4:
                nb_surveillances = surveillance_base + self.ecart_1_2 + self.ecart_2_3 + self.ecart_3_4

            # Convertir en heures: chaque surveillance = 1.5 heures
            nb_heures = nb_surveillances * 1.5
            
            # Arrondir au multiple de 1.5 le plus proche
            # Pour garantir que les heures sont toujours des multiples de 1.5
            nb_heures_arrondi = round(nb_heures / 1.5) * 1.5
            
            for grade in grades:
                if grade in self.profs_par_grade:
                    surveillances[grade] = nb_heures_arrondi

        return surveillances

    def _calculer_indisponibilites(self, surveillances_par_grade: Dict[str, int]) -> Dict[str, int]:
        """
        Calcule le nombre de créneaux d'indisponibilité autorisés par grade.

        Principe: Relation inversement proportionnelle avec les surveillances.
        Plus un grade a de surveillances, moins il peut être indisponible.
        """
        indisponibilites = {}

        if not surveillances_par_grade:
            return indisponibilites

        # Trouver le min et max de surveillances pour normaliser
        min_surveillances = min(surveillances_par_grade.values())
        max_surveillances = max(surveillances_par_grade.values())

        # Définir les bornes pour les indisponibilités
        # Celui qui a le plus de surveillances aura le moins d'indisponibilités
        min_indispo = max(2, math.floor(self.nb_creneaux_total * 0.10))  # Min 10% ou 2
        max_indispo = math.floor(self.nb_creneaux_total * 0.40)  # Max 40%

        for grade, nb_surveillances in surveillances_par_grade.items():
            if max_surveillances == min_surveillances:
                # Tous les grades ont le même nombre de surveillances
                nb_indispo = (min_indispo + max_indispo) // 2
            else:
                # Interpolation linéaire inverse
                # Plus de surveillances → moins d'indisponibilités
                ratio = (nb_surveillances - min_surveillances) / (max_surveillances - min_surveillances)
                nb_indispo = max_indispo - ratio * (max_indispo - min_indispo)
                nb_indispo = round(nb_indispo)

            # Vérifier que le nombre d'indisponibilités laisse assez de créneaux disponibles
            # On doit garantir: nb_creneaux_disponibles >= nb_surveillances * 1.5 (marge de 50%)
            creneaux_necessaires = math.ceil(nb_surveillances * 1.5)
            indispo_max_possible = self.nb_creneaux_total - creneaux_necessaires

            nb_indispo = min(nb_indispo, indispo_max_possible)
            nb_indispo = max(min_indispo, nb_indispo)  # Toujours au moins le minimum
            indisponibilites[grade] = int(round(nb_indispo))

        return indisponibilites


def analyze_surveillance_data(enseignants_file, planning_file, ecart_1_2=None, ecart_2_3=None, ecart_3_4=None):
    """
    Analyse les données de surveillance à partir des fichiers Excel
    
    Args:
        enseignants_file: Chemin vers le fichier Excel des enseignants
        planning_file: Chemin vers le fichier Excel du planning (repartition_salle)
        ecart_1_2: Écart personnalisé entre niveau 1 et 2 (optionnel)
        ecart_2_3: Écart personnalisé entre niveau 2 et 3 (optionnel)
        ecart_3_4: Écart personnalisé entre niveau 3 et 4 (optionnel)
    
    Returns:
        dict: Résultats de l'analyse
    """
    
    # Liste des grades
    grades = ['PR', 'MC', 'V', 'MA', 'AS', 'AC', 'PES', 'PTC', 'EX']
    
    try:
        # Charger les données des enseignants
        df_enseignants = pd.read_excel(enseignants_file)
        
        # Charger les données du planning (repartition_salle)
        df_planning = pd.read_excel(planning_file)
        
        # Filtrer les profs qui ont participé à la surveillance
        profs_surveillance = df_enseignants[df_enseignants['participe_surveillance'] == True]
        
        # Compter le nombre de profs par grade
        comptage_par_grade = profs_surveillance['grade_code_ens'].value_counts()
        
        # Calculer le nombre total de créneaux uniques
        # Un créneau = combinaison unique de (dateExam, h_debut, h_fin, session)
        df_planning['creneau'] = (
            df_planning['dateExam'].astype(str) + '_' + 
            df_planning['h_debut'].astype(str) + '_' + 
            df_planning['h_fin'].astype(str) + '_' + 
            df_planning['session'].astype(str)
        )
        nbr_creneau_total = df_planning['creneau'].nunique()
        
        # IMPORTANT: Calculer le nombre TOTAL de salles (pas seulement les uniques)
        # C'est le nombre de lignes dans le planning = nombre de salles à surveiller
        nbr_salle_total = len(df_planning)
        
        # Calculer le nombre d'enseignants nécessaires
        # Règle: 2 profs par salle + 1 prof supplémentaire pour chaque 2 salles (pour absences)
        nb_enseignants_base = nbr_salle_total * 2  # 2 profs par salle
        nb_enseignants_supplementaires = nbr_salle_total // 2.5
        nb_enseignants_total_necessaire = nb_enseignants_base + nb_enseignants_supplementaires
        
        # Calculer le nombre moyen d'enseignants par salle pour le calcul
        nb_enseignants_par_salle = nb_enseignants_total_necessaire / nbr_salle_total
        
        # Préparer le dictionnaire des profs par grade pour le calculateur
        profs_par_grade = {}
        for grade in grades:
            count = comptage_par_grade.get(grade, 0)
            if count > 0:
                profs_par_grade[grade] = int(count)
        
        # Utiliser le calculateur pour obtenir les surveillances et indisponibilités
        calculateur = CalculateurSurveillances(
            nb_salles=nbr_salle_total,
            profs_par_grade=profs_par_grade,
            nb_enseignants_par_salle=nb_enseignants_par_salle,
            nb_creneaux_total=nbr_creneau_total,
            ecart_1_2=ecart_1_2,
            ecart_2_3=ecart_2_3,
            ecart_3_4=ecart_3_4
        )
        
        surveillances_par_grade, indisponibilites_par_grade = calculateur.calculer()
        
        # Préparer les résultats par grade avec les calculs
        grades_data = []
        for grade in grades:
            count = comptage_par_grade.get(grade, 0)
            if count > 0:  # Inclure uniquement les grades présents
                grades_data.append({
                    'grade': grade,
                    'nbr_professeurs': int(count),
                    'surveillances_par_prof': float(surveillances_par_grade.get(grade, 0)),
                    'indisponibilites_autorisees': int(indisponibilites_par_grade.get(grade, 0))
                })
        
        # Construire le résultat final
        result = {
            'success': True,
            'data': {
                'nbr_prof_total': int(len(profs_surveillance)),
                'nbr_salle_total': int(nbr_salle_total),
                'nbr_creneau_total': int(nbr_creneau_total),
                'nb_enseignants_par_salle': round(nb_enseignants_par_salle, 2),
                'nb_enseignants_base': 2,  # 2 profs obligatoires par salle
                'nb_enseignants_supplementaires': nb_enseignants_supplementaires,
                'grades': grades_data,
                'ecarts': {
                    'ecart_1_2': round(calculateur.ecart_1_2, 1),
                    'ecart_2_3': round(calculateur.ecart_2_3, 1),
                    'ecart_3_4': round(calculateur.ecart_3_4, 1)
                }
            },
            'details': {
                'nbr_enseignants_total': int(len(df_enseignants)),
                'nbr_sessions_planning': int(len(df_planning)),
                'total_surveillances_necessaires': int(nb_enseignants_total_necessaire),
                'formule': f'2 profs/salle × {nbr_salle_total} + {nb_enseignants_supplementaires} supplémentaires = {nb_enseignants_total_necessaire} enseignants'
            }
        }
        
        return result
        
    except FileNotFoundError as e:
        return {
            'success': False,
            'error': f'Fichier non trouvé: {str(e)}'
        }
    except KeyError as e:
        return {
            'success': False,
            'error': f'Colonne manquante dans le fichier: {str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Erreur lors de l\'analyse: {str(e)}'
        }


def main():
    """
    Point d'entrée principal du script
    Usage: python analyze_surveillance.py <enseignants_file> <planning_file> [ecart_1_2] [ecart_2_3] [ecart_3_4]
    """
    print(f"DEBUG: sys.argv = {sys.argv}", file=sys.stderr)
    
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python analyze_surveillance.py <enseignants_file> <planning_file> [ecart_1_2] [ecart_2_3] [ecart_3_4]'
        }))
        sys.exit(1)
    
    enseignants_file = sys.argv[1]
    planning_file = sys.argv[2]
    
    # Paramètres optionnels pour les écarts personnalisés
    print(f"DEBUG: len(sys.argv) = {len(sys.argv)}", file=sys.stderr)
    print(f"DEBUG: sys.argv[3] = '{sys.argv[3]}' (type: {type(sys.argv[3])})" if len(sys.argv) > 3 else "DEBUG: No argv[3]", file=sys.stderr)
    print(f"DEBUG: sys.argv[4] = '{sys.argv[4]}' (type: {type(sys.argv[4])})" if len(sys.argv) > 4 else "DEBUG: No argv[4]", file=sys.stderr)
    print(f"DEBUG: sys.argv[5] = '{sys.argv[5]}' (type: {type(sys.argv[5])})" if len(sys.argv) > 5 else "DEBUG: No argv[5]", file=sys.stderr)
    
    ecart_1_2 = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != 'null' else None
    ecart_2_3 = float(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] != 'null' else None
    ecart_3_4 = float(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] != 'null' else None
    
    print(f"DEBUG: Parsed ecarts - ecart_1_2: {ecart_1_2}, ecart_2_3: {ecart_2_3}, ecart_3_4: {ecart_3_4}", file=sys.stderr)
    
    result = analyze_surveillance_data(enseignants_file, planning_file, ecart_1_2, ecart_2_3, ecart_3_4)
    
    # Afficher le résultat en JSON
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
