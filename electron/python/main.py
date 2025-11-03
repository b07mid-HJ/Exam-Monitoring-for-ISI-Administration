"""
Exam Invigilation Scheduling System - Slot-Based Assignment
============================================================

Features:
- Simplified slot-based assignment (not room-specific)
- Teachers assigned to TIME SLOTS, not individual exam rooms
- Imports data from 3 Excel files:
  1. Enseignants avec code ensiegant responsable.xlsx - Teacher list with grades and details
  2. Souhaits Enseignants.xlsx - Teacher unavailability preferences (matched by name)
  3. Répartition SE --Salles -Dates et Séances et code ensiegnts responsables.xlsx - Exam schedule
- Fixed 4 time slots per day: S1, S2, S3, S4
- Configurable grade-based target hours (passed as parameter)
- Grade-based target hours with HARD constraint (must meet exactly)
- Responsible teachers must work during their exam time slots
- Buffer teachers per slot: exams × 2 (minimum) + 1-4 extra (based on slot size)
- Time clustering for teacher schedules
- Respects unavailability constraints

Scheduling Logic:
- HARD: Teachers must meet target hours (no deviation allowed)
- HARD: Each time slot gets minimum (exams × 2) teachers
- HARD: Teachers unavailable cannot be assigned
- SOFT (Priority 0): Prefer responsible teachers work their exam slots (weight 200)
- SOFT (Priority 1): Reach target with buffer (exams × 2 + 1-4 buffer) (weight 150)
- SOFT (Priority 2): Cluster assignments in consecutive time slots (weight 100)
- SOFT (Priority 3): Cluster assignments on consecutive days (weight 50)

Author: Claude
Date: 2025-10-18
"""

from ortools.sat.python import cp_model
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple, Optional
import pandas as pd
from collections import defaultdict
from datetime import datetime
import math
import sys
import io

# Force stdout to use UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ============================================================================
# CONSTANTS
# ============================================================================

# Fixed time slots
TIME_SLOTS = {
    1: {"name": "S1", "start": "08:30", "end": "10:00", "hours": 1.5},
    2: {"name": "S2", "start": "10:30", "end": "12:00", "hours": 1.5},
    3: {"name": "S3", "start": "12:30", "end": "14:00", "hours": 1.5},
    4: {"name": "S4", "start": "14:30", "end": "16:00", "hours": 1.5}
}


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class Teacher:
    """Teacher with grade, required hours, and contact information."""
    id: str
    grade: str
    required_hours: float
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    unavailable_days: Set[int] = field(default_factory=set)
    unavailable_slots: Set[Tuple[int, int]] = field(default_factory=set)  # (day, slot)
    
    def is_available(self, day: int, slot: int) -> bool:
        return day not in self.unavailable_days and (day, slot) not in self.unavailable_slots
    
    def get_full_name(self) -> str:
        """Return full name."""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.id
    
    def __hash__(self):
        return hash(self.id)


@dataclass
class TimeSlotInfo:
    """Information about a specific time slot."""
    day: int
    slot: int  # 1, 2, 3, or 4
    date: str
    num_exams: int
    exam_ids: List[str]
    responsible_teachers: Set[str]  # Teachers responsible for exams in this slot
    
    def get_time_key(self) -> Tuple[int, int]:
        return (self.day, self.slot)
    
    def get_hours(self) -> float:
        """Get duration in hours."""
        return TIME_SLOTS[self.slot]["hours"]
    
    def get_min_teachers(self) -> int:
        """Minimum teachers needed: exams × 2"""
        return self.num_exams * 2
    
    def get_buffer(self) -> int:
        """Buffer teachers: 1-4 based on number of exams"""
        if self.num_exams <= 3:
            return 1
        elif self.num_exams <= 7:
            return 2
        elif self.num_exams <= 12:
            return 3
        else:
            return 4
    
    def get_target_teachers(self) -> int:
        """Target number of teachers for this slot"""
        return self.get_min_teachers() + self.get_buffer()
    
    def __str__(self):
        slot_info = TIME_SLOTS[self.slot]
        return f"Day {self.day}, {slot_info['name']} ({slot_info['start']}-{slot_info['end']}): {self.num_exams} exams"


# ============================================================================
# DATA IMPORT
# ============================================================================

class DataImporter:
    """Import exam and teacher data from Excel files."""
    
    @staticmethod
    def parse_time_slot(h_debut_str) -> int:
        """Parse time string to slot number (1-4)."""
        try:
            if isinstance(h_debut_str, datetime):
                hour = h_debut_str.hour
                minute = h_debut_str.minute
            else:
                time_part = str(h_debut_str).split()[-1]
                hour, minute = map(int, time_part.split(':')[:2])
            
            if hour == 8 and minute == 30:
                return 1
            elif hour == 10 and minute == 30:
                return 2
            elif hour == 12 and minute == 30:
                return 3
            elif hour == 14 and minute == 30:
                return 4
            else:
                print(f"Warning: Unknown time {hour}:{minute}, defaulting to slot 1")
                return 1
        except:
            print(f"Warning: Could not parse time {h_debut_str}, defaulting to slot 1")
            return 1
    
    @staticmethod
    def parse_seance_to_slot(seance: str) -> int:
        """Convert seance code (S1, S2, S3, S4) to slot number."""
        seance_str = str(seance).strip().upper()
        if seance_str == 'S1':
            return 1
        elif seance_str == 'S2':
            return 2
        elif seance_str == 'S3':
            return 3
        elif seance_str == 'S4':
            return 4
        else:
            print(f"Warning: Unknown seance {seance}, defaulting to slot 1")
            return 1
    
    @staticmethod
    def import_teachers(filepath: str, grade_hours: Dict[str, float]) -> List[Teacher]:
        """Import teachers from Enseignants avec code ensiegant responsable.xlsx"""
        df = pd.read_excel(filepath)
        
        # Only keep teachers who participate in surveillance
        df = df[df['participe_surveillance'].astype(str).str.strip().str.upper() == 'TRUE']
        
        # Find maximum existing ID to generate new ones for missing IDs
        max_id = 0
        for idx, row in df.iterrows():
            try:
                if pd.notna(row['code_smartex_ens']) and row['code_smartex_ens'] != '':
                    current_id = int(row['code_smartex_ens'])
                    max_id = max(max_id, current_id)
            except (ValueError, TypeError):
                continue
        
        print(f"  - Maximum existing teacher ID: {max_id}")
        
        # Track generated IDs
        next_id = max_id + 1
        generated_ids = 0
        
        teachers = []
        for idx, row in df.iterrows():
            try:
                grade = str(row['grade_code_ens']).strip().upper()
                
                # Handle missing or empty code_smartex_ens
                if pd.isna(row['code_smartex_ens']) or row['code_smartex_ens'] == '':
                    teacher_id = str(next_id).zfill(3)
                    next_id += 1
                    generated_ids += 1
                else:
                    teacher_id = str(int(row['code_smartex_ens'])).zfill(3)
                
                # Get required hours for this grade
                required_hours = grade_hours.get(grade, 9.0)
                
                teacher = Teacher(
                    id=teacher_id,
                    grade=grade,
                    required_hours=required_hours,
                    first_name=str(row['prenom_ens']).strip(),
                    last_name=str(row['nom_ens']).strip(),
                    email=str(row['email_ens']).strip()
                )
                teachers.append(teacher)
            except (ValueError, TypeError) as e:
                continue
        
        print(f"✓ Imported {len(teachers)} teachers from {filepath}")
        if generated_ids > 0:
            print(f"  - Generated {generated_ids} new IDs for teachers with missing codes (starting from {max_id + 1})")
        
        grade_counts = defaultdict(int)
        for t in teachers:
            grade_counts[t.grade] += 1
        
        print("\nTeacher distribution by grade:")
        for grade in sorted(grade_counts.keys()):
            target_hours = grade_hours.get(grade, 9.0)
            print(f"  - {grade}: {grade_counts[grade]} teachers ({target_hours}h target each)")
        
        return teachers
    
    @staticmethod
    def import_unavailability(filepath: str, teachers: List[Teacher], 
                            teacher_details_filepath: str) -> None:
        """Import teacher unavailability from Souhaits Enseignants.xlsx by matching names
        
        Expected format:
        - Column 'Enseignant': Teacher name (e.g., "N.BEN HARIZ")
        - Column 'Jour': Day name (Lundi, Mardi, Mercredi, Jeudi, Vendredi, Samedi, Dimanche)
        - Column 'Séances': Comma-separated sessions (e.g., "S1,S2,S3,S4")
        """
        df = pd.read_excel(filepath)
        
        # Load teacher details to create name-to-id mapping
        teacher_details_df = pd.read_excel(teacher_details_filepath)
        teacher_details_df = teacher_details_df.dropna(subset=['code_smartex_ens'])
        teacher_details_df = teacher_details_df[teacher_details_df['code_smartex_ens'] != '']
        
        # Create name-to-id mapping (case-insensitive, handle various formats)
        name_to_id = {}
        for idx, row in teacher_details_df.iterrows():
            try:
                teacher_id = str(int(row['code_smartex_ens'])).zfill(3)
                first_name = str(row['prenom_ens']).strip().lower()
                last_name = str(row['nom_ens']).strip().lower()
                
                # Store multiple formats
                full_name = f"{first_name} {last_name}"
                name_to_id[full_name] = teacher_id
                
                # Also store with first initial
                if first_name:
                    initial_format = f"{first_name[0]}.{last_name}"
                    name_to_id[initial_format] = teacher_id
            except (ValueError, TypeError):
                continue
        
        # Day name to number mapping (French)
        day_mapping = {
            'lundi': 1,
            'mardi': 2,
            'mercredi': 3,
            'jeudi': 4,
            'vendredi': 5,
            'samedi': 6,
            'dimanche': 7
        }
        
        teacher_dict = {t.id: t for t in teachers}
        constraints_added = 0
        unmatched_teachers = set()
        
        for idx, row in df.iterrows():
            try:
                # Get teacher name (can be in format "N.BEN HARIZ" or "First Last")
                teacher_name = str(row['Enseignant']).strip().lower()
                
                # Get day name and convert to number
                day_name = str(row['Jour']).strip().lower()
                if day_name not in day_mapping:
                    print(f"Warning: Unknown day name '{day_name}', skipping")
                    continue
                day = day_mapping[day_name]
                
                # Get sessions (can be "S1,S2,S3,S4" or "S1,S2" etc.)
                seances_str = str(row['Séances']).strip()
                seances = [s.strip().upper() for s in seances_str.split(',')]
                
                # Find teacher ID by name
                teacher_id = name_to_id.get(teacher_name)
                
                if teacher_id is None:
                    unmatched_teachers.add(teacher_name)
                    continue
                
                if teacher_id not in teacher_dict:
                    continue
                
                teacher = teacher_dict[teacher_id]
                
                # Add unavailability for each session
                for seance in seances:
                    slot = DataImporter.parse_seance_to_slot(seance)
                    teacher.unavailable_slots.add((day, slot))
                    constraints_added += 1
                    
            except (ValueError, TypeError, KeyError) as e:
                print(f"Warning: Error processing row {idx}: {e}")
                continue
        
        num_constrained = sum(1 for t in teachers if t.unavailable_slots or t.unavailable_days)
        
        print(f"✓ Imported {constraints_added} unavailability constraints from {filepath}")
        print(f"  - Teachers with constraints: {num_constrained}/{len(teachers)}")
        if unmatched_teachers:
            print(f"  - Unmatched teachers: {len(unmatched_teachers)} (not in participating teachers list)")
            print(f"    Examples: {', '.join(list(unmatched_teachers)[:5])}")
    
    @staticmethod
    def import_exams_as_slots(filepath: str) -> List[TimeSlotInfo]:
        """Import exams and group them by time slots."""
        df = pd.read_excel(filepath)
        
        # Remove duplicate rows
        df = df.drop_duplicates()
        
        # Convert dates and assign day numbers
        df['dateExam'] = pd.to_datetime(df['dateExam'], format='%d/%m/%Y')
        unique_dates = sorted(df['dateExam'].unique())
        date_to_day = {date: idx + 1 for idx, date in enumerate(unique_dates)}
        
        # Group exams by time slot
        slot_data = defaultdict(lambda: {
            'exam_ids': [],
            'responsible_teachers': set(),
            'date': None
        })
        
        for idx, row in df.iterrows():
            try:
                date_str = row['dateExam'].strftime('%Y-%m-%d')
                slot = DataImporter.parse_time_slot(row['h_debut'])
                day_number = date_to_day[row['dateExam']]
                teacher_id = str(int(row['enseignant'])).zfill(3)
                exam_id = f"E{idx+1:03d}"
                
                key = (day_number, slot)
                slot_data[key]['exam_ids'].append(exam_id)
                slot_data[key]['responsible_teachers'].add(teacher_id)
                slot_data[key]['date'] = date_str
            except (ValueError, TypeError, KeyError) as e:
                continue
        
        # Create TimeSlotInfo objects
        time_slots = []
        for (day, slot), data in sorted(slot_data.items()):
            time_slot_info = TimeSlotInfo(
                day=day,
                slot=slot,
                date=data['date'],
                num_exams=len(data['exam_ids']),
                exam_ids=data['exam_ids'],
                responsible_teachers=data['responsible_teachers']
            )
            time_slots.append(time_slot_info)
        
        print(f"✓ Imported and grouped exams into {len(time_slots)} time slots")
        print(f"  - Total exams: {sum(ts.num_exams for ts in time_slots)}")
        print(f"  - Days: {len(unique_dates)} ({unique_dates[0].strftime('%d/%m/%Y')} to {unique_dates[-1].strftime('%d/%m/%Y')})")
        
        print("\n  Time slot requirements:")
        for ts in time_slots:
            slot_info = TIME_SLOTS[ts.slot]
            print(f"    Day {ts.day}, {slot_info['name']}: {ts.num_exams} exams → "
                  f"{ts.get_min_teachers()} min + {ts.get_buffer()} buffer = "
                  f"{ts.get_target_teachers()} teachers needed")
        
        return time_slots


# ============================================================================
# SCHEDULER
# ============================================================================

class SlotBasedScheduler:
    """CP-SAT based scheduler with slot-based assignment."""
    
    def __init__(self, teachers: List[Teacher], time_slots: List[TimeSlotInfo]):
        self.teachers = {t.id: t for t in teachers}
        self.time_slots = time_slots
        
        self.model = cp_model.CpModel()
        self.assignments = {}  # (teacher_id, time_slot_key) -> BoolVar
        self.teacher_hours_vars = {}  # teacher_id -> IntVar
        self.solution = None
        
        # Index time slots by key
        self.time_slot_dict = {ts.get_time_key(): ts for ts in time_slots}
        
        print(f"\nScheduler initialized:")
        print(f"  - Teachers: {len(self.teachers)}")
        print(f"  - Time slots: {len(self.time_slots)}")
        print(f"  - Total teacher-slot assignments needed: {sum(ts.get_target_teachers() for ts in time_slots)}")
    
    def _create_variables(self):
        """Create decision variables."""
        print("\nCreating variables...")
        
        for teacher_id in self.teachers:
            for ts in self.time_slots:
                var_name = f"assign_{teacher_id}_d{ts.day}_s{ts.slot}"
                self.assignments[(teacher_id, ts.get_time_key())] = self.model.NewBoolVar(var_name)
        
        print(f"  ✓ {len(self.assignments)} assignment variables")
    
    def _add_hard_constraints(self):
        """Add mandatory constraints."""
        print("\nAdding hard constraints...")
        
        # 1. Each time slot needs MINIMUM teachers (exams × 2) - HARD
        for ts in self.time_slots:
            available_teachers = [self.assignments[(t_id, ts.get_time_key())]
                                 for t_id in self.teachers
                                 if self.teachers[t_id].is_available(ts.day, ts.slot)]
            
            min_teachers = ts.get_min_teachers()
            
            # HARD: Must have at least minimum (2 per exam)
            self.model.Add(sum(available_teachers) >= min_teachers)
            
            # Allow reasonable upper bound (don't over-assign)
            max_teachers = min_teachers + 20  # Flexible upper bound
            self.model.Add(sum(available_teachers) <= max_teachers)
        
        print(f"  ✓ Each time slot gets minimum (exams × 2) teachers (HARD)")
        print(f"  ✓ Buffer (1-4 extra) will be soft preference")
        
        # 2. Responsible teachers PREFER to work during their exam time slots (SOFT)
        responsible_assigned = 0
        responsible_unavailable = []
        responsible_missing = []
        
        for ts in self.time_slots:
            for resp_id in ts.responsible_teachers:
                if resp_id not in self.teachers:
                    responsible_missing.append(resp_id)
                    continue
                
                teacher = self.teachers[resp_id]
                if not teacher.is_available(ts.day, ts.slot):
                    responsible_unavailable.append((resp_id, ts.day, ts.slot))
                    continue
                
                # SOFT PREFERENCE: Try to assign responsible teacher (will be added to soft constraints)
                responsible_assigned += 1
        
        print(f"  ✓ {responsible_assigned} responsible teachers available (will prefer to assign)")
        if responsible_missing:
            print(f"  ℹ {len(set(responsible_missing))} responsible teachers not in pool (others will cover)")
        if responsible_unavailable:
            print(f"  ℹ {len(responsible_unavailable)} responsible teachers unavailable (others will cover)")
        
        # Store for soft constraints
        self.responsible_preferences = []
        for ts in self.time_slots:
            for resp_id in ts.responsible_teachers:
                if resp_id in self.teachers and self.teachers[resp_id].is_available(ts.day, ts.slot):
                    self.responsible_preferences.append((resp_id, ts.get_time_key()))

        
        # 3. Teachers can't work when unavailable
        unavailable_count = 0
        for teacher_id, teacher in self.teachers.items():
            for ts in self.time_slots:
                if not teacher.is_available(ts.day, ts.slot):
                    self.model.Add(self.assignments[(teacher_id, ts.get_time_key())] == 0)
                    unavailable_count += 1
        
        print(f"  ✓ Unavailability constraints applied ({unavailable_count} blocked assignments)")
        
        # 4. HARD CONSTRAINT: Teachers must meet their target hours exactly
        for teacher_id, teacher in self.teachers.items():
            hours_expr = []
            for ts in self.time_slots:
                hours_int = int(ts.get_hours() * 10)
                hours_expr.append(self.assignments[(teacher_id, ts.get_time_key())] * hours_int)
            
            total_hours = self.model.NewIntVar(0, 500, f'hours_{teacher_id}')
            self.model.Add(total_hours == sum(hours_expr))
            self.teacher_hours_vars[teacher_id] = total_hours
            
            required_tenths = int(teacher.required_hours * 10)
            self.model.Add(total_hours == required_tenths)
        
        print(f"  ✓ All teachers must meet their exact target hours (HARD constraint)")
    
    def _add_soft_constraints(self):
        """Add optimization objectives."""
        print("\nSetting optimization objectives...")
        
        penalties = []
        
        # Get all days
        all_days = sorted(set(ts.day for ts in self.time_slots))
        
        # 0. HIGHEST PRIORITY: Prefer responsible teachers work during their exam slots (weight 200)
        resp_penalty = 0
        if hasattr(self, 'responsible_preferences'):
            for resp_id, slot_key in self.responsible_preferences:
                # Penalty if responsible teacher is NOT assigned
                not_assigned = self.model.NewBoolVar(f'resp_not_{resp_id}_{slot_key}')
                assigned_var = self.assignments[(resp_id, slot_key)]
                
                self.model.Add(assigned_var == 0).OnlyEnforceIf(not_assigned)
                self.model.Add(assigned_var == 1).OnlyEnforceIf(not_assigned.Not())
                
                penalties.append(not_assigned * 200)
                resp_penalty += 1
        
        if resp_penalty > 0:
            print(f"  ✓ Priority 0: Prefer responsible teachers (weight 200) - {resp_penalty} preferences")
        
        # 1. PRIORITY 1: Try to reach target with buffer (weight 150)
        buffer_penalty = 0
        for ts in self.time_slots:
            available_teachers = [self.assignments[(t_id, ts.get_time_key())]
                                 for t_id in self.teachers
                                 if self.teachers[t_id].is_available(ts.day, ts.slot)]
            
            # Count teachers assigned
            count = self.model.NewIntVar(0, 100, f'slot_count_{ts.day}_{ts.slot}')
            self.model.Add(count == sum(available_teachers))
            
            target = ts.get_target_teachers()
            
            # Penalty for deviation from target
            deviation = self.model.NewIntVar(-100, 100, f'slot_dev_{ts.day}_{ts.slot}')
            abs_dev = self.model.NewIntVar(0, 100, f'slot_absdev_{ts.day}_{ts.slot}')
            
            self.model.Add(deviation == count - target)
            self.model.AddAbsEquality(abs_dev, deviation)
            
            penalties.append(abs_dev * 150)
            buffer_penalty += 1
        
        print(f"  ✓ Priority 1: Try to reach buffer targets (weight 150) - {buffer_penalty} slots")
        
        # 2. PRIORITY 2: Time clustering - Prefer consecutive slots on same day (weight 100)
        time_gap_penalty = 0
        for teacher_id in self.teachers:
            for day in all_days:
                # Get slots that exist for this day
                day_slots = sorted(set(ts.slot for ts in self.time_slots if ts.day == day))
                
                for i in range(len(day_slots) - 1):
                    slot1, slot2 = day_slots[i], day_slots[i+1]
                    
                    key1 = (day, slot1)
                    key2 = (day, slot2)
                    
                    if key1 in self.time_slot_dict and key2 in self.time_slot_dict:
                        works_slot1 = self.assignments[(teacher_id, key1)]
                        works_slot2 = self.assignments[(teacher_id, key2)]
                        
                        # Penalty for gap (works in slot1 but not slot2)
                        has_gap = self.model.NewBoolVar(f'gap_{teacher_id}_d{day}_s{slot1}')
                        self.model.AddBoolAnd([works_slot1, works_slot2.Not()]).OnlyEnforceIf(has_gap)
                        self.model.AddBoolOr([works_slot1.Not(), works_slot2]).OnlyEnforceIf(has_gap.Not())
                        
                        penalties.append(has_gap * 100)
                        time_gap_penalty += 1
        
        print(f"  ✓ Priority 2: Time clustering (weight 100) - {time_gap_penalty} potential gaps")
        
        # 3. PRIORITY 3: Day clustering - Prefer consecutive days (weight 50)
        day_gap_penalty = 0
        for teacher_id in self.teachers:
            for i in range(len(all_days) - 1):
                day1, day2 = all_days[i], all_days[i+1]
                
                # Check if teacher works on day1
                slots_day1 = [(day1, ts.slot) for ts in self.time_slots if ts.day == day1]
                slots_day2 = [(day2, ts.slot) for ts in self.time_slots if ts.day == day2]
                
                if slots_day1 and slots_day2:
                    works_day1 = self.model.NewBoolVar(f'workday_{teacher_id}_d{day1}')
                    works_day2 = self.model.NewBoolVar(f'workday_{teacher_id}_d{day2}')
                    
                    self.model.AddMaxEquality(works_day1,
                        [self.assignments[(teacher_id, key)] for key in slots_day1])
                    self.model.AddMaxEquality(works_day2,
                        [self.assignments[(teacher_id, key)] for key in slots_day2])
                    
                    # Penalty for gap (works day1 but not day2)
                    day_gap = self.model.NewBoolVar(f'daygap_{teacher_id}_{day1}_{day2}')
                    self.model.AddBoolAnd([works_day1, works_day2.Not()]).OnlyEnforceIf(day_gap)
                    self.model.AddBoolOr([works_day1.Not(), works_day2]).OnlyEnforceIf(day_gap.Not())
                    
                    penalties.append(day_gap * 50)
                    day_gap_penalty += 1
        
        print(f"  ✓ Priority 3: Day clustering (weight 50) - {day_gap_penalty} potential gaps")
        
        # Minimize total penalties
        if penalties:
            total_penalty = self.model.NewIntVar(0, 100000000, 'total_penalty')
            self.model.Add(total_penalty == sum(penalties))
            self.model.Minimize(total_penalty)
        
        print("\n  Summary of optimization priorities:")
        print("    0. Prefer responsible teachers work their exam slots (weight 200)")
        print("    1. Try to reach buffer targets (weight 150)")
        print("    2. Minimize time gaps within days (weight 100)")
        print("    3. Minimize gaps between days (weight 50)")
    
    def solve(self, time_limit: int = 180) -> bool:
        """Solve the scheduling problem."""
        print("\n" + "="*70)
        print("SOLVING")
        print("="*70)
        
        self._create_variables()
        self._add_hard_constraints()
        self._add_soft_constraints()
        
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit
        
        print(f"\nSolving (time limit: {time_limit}s)...")
        status = solver.Solve(self.model)
        
        if status == cp_model.OPTIMAL:
            print("✓ OPTIMAL solution found!")
        elif status == cp_model.FEASIBLE:
            print("✓ FEASIBLE solution found")
        elif status == cp_model.INFEASIBLE:
            print("✗ INFEASIBLE - No solution exists")
            return False
        else:
            print(f"✗ Status: {solver.StatusName(status)}")
            return False
        
        self._extract_solution(solver)
        return True
    
    def _extract_solution(self, solver: cp_model.CpSolver):
        """Extract solution from solver."""
        self.solution = {
            'slot_teachers': defaultdict(list),  # (day, slot) -> list of teacher_ids
            'teacher_slots': defaultdict(list),  # teacher_id -> list of (day, slot)
            'teacher_hours': defaultdict(float)
        }
        
        for (teacher_id, slot_key), var in self.assignments.items():
            if solver.Value(var) == 1:
                self.solution['slot_teachers'][slot_key].append(teacher_id)
                self.solution['teacher_slots'][teacher_id].append(slot_key)
                
                ts = self.time_slot_dict[slot_key]
                self.solution['teacher_hours'][teacher_id] += ts.get_hours()
    
    def print_solution(self):
        """Print solution summary."""
        if not self.solution:
            print("No solution available")
            return
        
        print("\n" + "="*70)
        print("SOLUTION")
        print("="*70)
        
        # Time slot assignments
        for ts in sorted(self.time_slots, key=lambda x: (x.day, x.slot)):
            slot_info = TIME_SLOTS[ts.slot]
            teachers = self.solution['slot_teachers'][ts.get_time_key()]
            
            print(f"\n{'='*70}")
            print(f"Day {ts.day}, {slot_info['name']} ({slot_info['start']}-{slot_info['end']})")
            print(f"{'='*70}")
            print(f"Exams: {ts.num_exams} | Required: {ts.get_target_teachers()} teachers "
                  f"(min: {ts.get_min_teachers()}, buffer: {ts.get_buffer()})")
            print(f"Assigned: {len(teachers)} teachers")
            
            # Show responsible teachers
            resp_present = [t for t in teachers if t in ts.responsible_teachers]
            if resp_present:
                print(f"Responsible teachers present: {', '.join(resp_present)}")
            
            # Group by grade
            grade_counts = defaultdict(int)
            for t_id in teachers:
                grade_counts[self.teachers[t_id].grade] += 1
            
            grade_str = ", ".join(f"{grade}:{count}" for grade, count in sorted(grade_counts.items()))
            print(f"By grade: {grade_str}")
        
        # Teacher workload summary
        print(f"\n{'='*70}")
        print("TEACHER WORKLOAD")
        print("="*70)
        
        total_deviation = 0
        teachers_at_target = 0
        
        for grade in sorted(set(t.grade for t in self.teachers.values())):
            teachers_in_grade = [t for t in self.teachers.values() if t.grade == grade]
            print(f"\n{grade} (Target: {teachers_in_grade[0].required_hours}h - HARD CONSTRAINT):")
            
            for teacher in sorted(teachers_in_grade, key=lambda t: t.id):
                hours = self.solution['teacher_hours'][teacher.id]
                num_slots = len(self.solution['teacher_slots'][teacher.id])
                deviation = hours - teacher.required_hours
                total_deviation += abs(deviation)
                
                if abs(deviation) < 0.1:
                    status = "✓"
                    teachers_at_target += 1
                else:
                    status = "?"
                
                name = teacher.get_full_name()
                print(f"  {status} {teacher.id} ({name}): {hours:.1f}h / {teacher.required_hours:.1f}h ({num_slots} slots)")
        
        print(f"\n{'='*70}")
        print("SUMMARY")
        print("="*70)
        print(f"Teachers at exact target: {teachers_at_target}/{len(self.teachers)} ✓")
        print(f"Average deviation: {total_deviation / len(self.teachers):.2f}h per teacher")
        print(f"Total teacher-slot assignments: {sum(len(v) for v in self.solution['slot_teachers'].values())}")
    
    def export_solution_to_excel(self, filename: str = "schedule_solution.xlsx"):
        """Export solution to Excel with teacher names and emails."""
        if not self.solution:
            print("No solution to export")
            return
        
        data = []
        
        for ts in self.time_slots:
            teachers = self.solution['slot_teachers'][ts.get_time_key()]
            
            date_obj = datetime.strptime(ts.date, '%Y-%m-%d')
            date_str = date_obj.strftime('%d/%m/%Y')
            slot_info = TIME_SLOTS[ts.slot]
            
            for teacher_id in sorted(teachers):
                teacher = self.teachers[teacher_id]
                is_responsible = "OUI" if teacher_id in ts.responsible_teachers else "NON"
                
                data.append({
                    'Date': date_str,
                    'Jour': ts.day,
                    'Séance': slot_info['name'],
                    'Heure_Début': slot_info['start'],
                    'Heure_Fin': slot_info['end'],
                    'Nombre_Examens': ts.num_exams,
                    'Enseignant_ID': teacher_id,
                    'Nom': teacher.last_name,
                    'Prénom': teacher.first_name,
                    'Email': teacher.email,
                    'Grade': teacher.grade,
                    'Responsable': is_responsible
                })
        
        df = pd.DataFrame(data)
        df = df.sort_values(['Date', 'Séance', 'Enseignant_ID'])
        df.to_excel(filename, index=False)
        
        print(f"\n✓ Solution exported to {filename}")
        print(f"  - Total assignments: {len(data)}")


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("="*70)
    print("EXAM SCHEDULING SYSTEM - SLOT-BASED ASSIGNMENT")
    print("="*70)
    
    # Configuration: Grade-based hours (default values)
    GRADE_HOURS = {
        "PR": 6.0,   # Professeur
        "MA": 10.5,   # Maître Assistant  
        "MC": 6.0,   # Maître de Conférences
        "AC": 13.5,    # Assistant Contractuel
        "AS": 12.0,    # Assistant
        "PTC": 13.5,   # PTC
        "PES": 13.5,   # PES
        "V": 6.0,     # Vacataire
        "EX": 4.5     # External
    }
    
    # Check for command line arguments
    import argparse
    import json
    
    parser = argparse.ArgumentParser(description='Exam scheduling system')
    parser.add_argument('--grade-hours', type=str, help='JSON string with grade hours configuration')
    args = parser.parse_args()
    
    # Override default grade hours if provided via command line
    if args.grade_hours:
        try:
            custom_grade_hours = json.loads(args.grade_hours)
            print("Using custom grade hours configuration from UI")
            # Update the default values with the provided ones
            GRADE_HOURS.update(custom_grade_hours)
        except json.JSONDecodeError as e:
            print(f"Error parsing grade hours JSON: {e}")
            print("Using default grade hours configuration")
    
    print("\nGrade Hours Configuration:")
    for grade, hours in sorted(GRADE_HOURS.items()):
        print(f"  - {grade}: {hours}h")
    
    # File paths
    TEACHERS_FILE = "Enseignants_participants.xlsx"
    UNAVAILABILITY_FILE = "Souhaits_avec_ids.xlsx"
    EXAMS_FILE = "Répartition_SE_dedup.xlsx"
    
    print("\n" + "="*70)
    print("IMPORTING DATA")
    print("="*70)
    
    # Import data
    print(f"\n1. Loading teachers from {TEACHERS_FILE}...")
    teachers = DataImporter.import_teachers(
        TEACHERS_FILE, 
        GRADE_HOURS
    )
    
    print(f"\n2. Loading exams and grouping by time slots from {EXAMS_FILE}...")
    time_slots = DataImporter.import_exams_as_slots(EXAMS_FILE)
    
    print(f"\n3. Loading unavailability from {UNAVAILABILITY_FILE}...")
    DataImporter.import_unavailability(UNAVAILABILITY_FILE, teachers, TEACHERS_FILE)
    
    # Summary
    print(f"\n{'='*70}")
    print("WORKLOAD ANALYSIS")
    print("="*70)
    
    total_required = sum(t.required_hours for t in teachers)
    total_needed = sum(ts.get_target_teachers() * ts.get_hours() for ts in time_slots)
    total_minimum = sum(ts.get_min_teachers() * ts.get_hours() for ts in time_slots)
    
    print(f"\nTeacher capacity:")
    print(f"  - Total teachers: {len(teachers)}")
    print(f"  - Total target hours available: {total_required:.1f}h")
    
    print(f"\nWorkload needed:")
    print(f"  - Time slots: {len(time_slots)}")
    print(f"  - Total exams: {sum(ts.num_exams for ts in time_slots)}")
    print(f"  - Minimum hours needed (exams × 2): {total_minimum:.1f}h")
    print(f"  - Target hours with buffer: {total_needed:.1f}h")
    print(f"  - Match: {total_required / total_needed * 100:.1f}%")
    
    # Check feasibility
    if total_required < total_minimum * 0.98:
        print(f"\n⚠ CRITICAL WARNING: Target hours ({total_required:.1f}h) is less than minimum needed ({total_minimum:.1f}h)")
        print("  Solution is likely INFEASIBLE. Actions:")
        print("  - Increase target hours for some grades")
        print("  - Add more teachers to the pool")
        print("  - Reduce buffer requirements")
    elif total_required < total_needed * 0.95:
        print(f"\n⚠ WARNING: Target hours ({total_required:.1f}h) is less than target with buffer ({total_needed:.1f}h)")
        print("  Solution may struggle to meet buffer targets")
    elif total_required > total_needed * 1.1:
        print(f"\n⚠ NOTE: Target hours ({total_required:.1f}h) exceeds needed by >10%")
        print("  Some teachers may be assigned more than the buffer suggests")
    else:
        print(f"\n✓ Workload looks balanced!")
    
    # Check responsible teacher availability
    print(f"\n{'='*70}")
    print("RESPONSIBLE TEACHER CHECK")
    print("="*70)
    
    teacher_dict = {t.id: t for t in teachers}
    missing_teachers = set()
    unavailable_teachers = []
    available_responsible = 0
    
    for ts in time_slots:
        for resp_id in ts.responsible_teachers:
            if resp_id not in teacher_dict:
                missing_teachers.add(resp_id)
            elif not teacher_dict[resp_id].is_available(ts.day, ts.slot):
                unavailable_teachers.append((resp_id, ts.day, ts.slot))
            else:
                available_responsible += 1
    
    print(f"Available responsible teachers: {available_responsible}")
    if missing_teachers:
        print(f"ℹ Missing from pool: {len(missing_teachers)} teachers")
        print(f"  IDs: {', '.join(sorted(list(missing_teachers)[:10]))}")
        if len(missing_teachers) > 10:
            print(f"  ... and {len(missing_teachers) - 10} more")
        print("  → These exams will be covered by other available teachers")
    if unavailable_teachers:
        print(f"ℹ Unavailable during their exams: {len(unavailable_teachers)} conflicts")
        for resp_id, day, slot in unavailable_teachers[:3]:
            print(f"    - Teacher {resp_id}: Day {day}, Slot {slot}")
        if len(unavailable_teachers) > 3:
            print(f"    ... and {len(unavailable_teachers) - 3} more")
        print("  → These exams will be covered by other available teachers")
    
    if available_responsible > 0:
        print(f"\n✓ Will optimize to use {available_responsible} available responsible teachers when possible")
    
    # Solve
    print(f"\n{'='*70}")
    print("STARTING OPTIMIZATION")
    print("="*70)
    
    scheduler = SlotBasedScheduler(teachers, time_slots)
        
    if scheduler.solve(time_limit=30):
        scheduler.print_solution()
        scheduler.export_solution_to_excel("schedule_solution.xlsx")
        print("\n" + "="*70)
        print("✓ SCHEDULE COMPLETE!")
        print("="*70)
        print("\nThe solution file 'schedule_solution.xlsx' includes:")
        print("  - Teacher assignments by TIME SLOT (not specific rooms)")
        print("  - Teacher names (Nom, Prénom) and emails")
        print("  - Number of exams per slot")
        print("  - Responsible teacher indicators")
        print("\nNote: Teachers are assigned to time slots. You can distribute them")
        print("      to specific exam rooms manually or randomly within each slot.")
    else:
        print("\n" + "="*70)
        print("❌ COULD NOT FIND SOLUTION")
        print("="*70)
        print("\nPossible issues:")
        print("  1. Target hours don't match workload (check GRADE_HOURS configuration)")
        print("  2. Unavailability constraints are too restrictive")
        print("  3. Not enough teachers for the required workload")
        print("\nSuggestions:")
        print("  - Review the 'WORKLOAD ANALYSIS' section above")
        print("  - Adjust GRADE_HOURS values to match total workload needed")
        print("  - Review unavailability constraints in Souhaits Enseignants.xlsx")
        print("  - Consider reducing buffer requirements")
        print("  - Add more teachers to the pool")