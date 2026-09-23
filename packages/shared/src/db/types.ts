export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_policies: {
        Row: {
          ack_timeout_s: number | null
          dedupe_window_s: number | null
          escalate_to: string[]
          hazard_group: string
          kind: string
          needs_ack: boolean
          notify_now: string[]
          rate_capped: boolean
          tier_default: Database["public"]["Enums"]["alert_tier"]
          tier_max: Database["public"]["Enums"]["alert_tier"]
        }
        Insert: {
          ack_timeout_s?: number | null
          dedupe_window_s?: number | null
          escalate_to?: string[]
          hazard_group: string
          kind: string
          needs_ack?: boolean
          notify_now?: string[]
          rate_capped?: boolean
          tier_default: Database["public"]["Enums"]["alert_tier"]
          tier_max: Database["public"]["Enums"]["alert_tier"]
        }
        Update: {
          ack_timeout_s?: number | null
          dedupe_window_s?: number | null
          escalate_to?: string[]
          hazard_group?: string
          kind?: string
          needs_ack?: boolean
          notify_now?: string[]
          rate_capped?: boolean
          tier_default?: Database["public"]["Enums"]["alert_tier"]
          tier_max?: Database["public"]["Enums"]["alert_tier"]
        }
        Relationships: []
      }
      app_config: {
        Row: {
          checkpoint_every_min: number
          danger_radius_m: number
          demo_mode: boolean
          dry_run_external: boolean
          fuel_price_inr_per_l: number
          guardian_radius_m: number
          id: boolean
          max_frames_per_tick: number
          motion_speed_kmh: number
          state_stale_s: number
          updated_at: string
        }
        Insert: {
          checkpoint_every_min?: number
          danger_radius_m?: number
          demo_mode?: boolean
          dry_run_external?: boolean
          fuel_price_inr_per_l?: number
          guardian_radius_m?: number
          id?: boolean
          max_frames_per_tick?: number
          motion_speed_kmh?: number
          state_stale_s?: number
          updated_at?: string
        }
        Update: {
          checkpoint_every_min?: number
          danger_radius_m?: number
          demo_mode?: boolean
          dry_run_external?: boolean
          fuel_price_inr_per_l?: number
          guardian_radius_m?: number
          id?: boolean
          max_frames_per_tick?: number
          motion_speed_kmh?: number
          state_stale_s?: number
          updated_at?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          granted_at: string
          id: string
          operator_id: string
          purpose: string
          revoked_at: string | null
          version: string
        }
        Insert: {
          granted_at?: string
          id?: string
          operator_id: string
          purpose?: string
          revoked_at?: string | null
          version: string
        }
        Update: {
          granted_at?: string
          id?: string
          operator_id?: string
          purpose?: string
          revoked_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          alert_kind: string | null
          audiences: Database["public"]["Enums"]["audience"][]
          default_tier: Database["public"]["Enums"]["alert_tier"] | null
          ledger: boolean
          lesson_code: string | null
          raises_alert: boolean
          replay: boolean
          type: string
        }
        Insert: {
          alert_kind?: string | null
          audiences: Database["public"]["Enums"]["audience"][]
          default_tier?: Database["public"]["Enums"]["alert_tier"] | null
          ledger?: boolean
          lesson_code?: string | null
          raises_alert?: boolean
          replay?: boolean
          type: string
        }
        Update: {
          alert_kind?: string | null
          audiences?: Database["public"]["Enums"]["audience"][]
          default_tier?: Database["public"]["Enums"]["alert_tier"] | null
          ledger?: boolean
          lesson_code?: string | null
          raises_alert?: boolean
          replay?: boolean
          type?: string
        }
        Relationships: []
      }
      explanation_templates: {
        Row: {
          anomaly_type: Database["public"]["Enums"]["anomaly_type"]
          en: string
          hi: string
        }
        Insert: {
          anomaly_type: Database["public"]["Enums"]["anomaly_type"]
          en: string
          hi: string
        }
        Update: {
          anomaly_type?: Database["public"]["Enums"]["anomaly_type"]
          en?: string
          hi?: string
        }
        Relationships: []
      }
      fault_codes: {
        Row: {
          active: boolean
          cid: number | null
          cleared_at: string | null
          code_type: string
          description_key: string
          eid: number | null
          fmi: number | null
          id: string
          machine_id: string
          mid: number | null
          run_id: string | null
          severity: Database["public"]["Enums"]["fault_severity"]
          spn: number | null
          ts: string
        }
        Insert: {
          active?: boolean
          cid?: number | null
          cleared_at?: string | null
          code_type: string
          description_key: string
          eid?: number | null
          fmi?: number | null
          id?: string
          machine_id: string
          mid?: number | null
          run_id?: string | null
          severity: Database["public"]["Enums"]["fault_severity"]
          spn?: number | null
          ts: string
        }
        Update: {
          active?: boolean
          cid?: number | null
          cleared_at?: string | null
          code_type?: string
          description_key?: string
          eid?: number | null
          fmi?: number | null
          id?: string
          machine_id?: string
          mid?: number | null
          run_id?: string | null
          severity?: Database["public"]["Enums"]["fault_severity"]
          spn?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "fault_codes_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_codes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_models: {
        Row: {
          baseline_idle_pct: number
          code: string
          id: string
          idle_fuel_lph: number | null
          machine_type: string
          name: string
          rated_rpm: number | null
          source_url: string | null
          work_fuel_lph: number | null
        }
        Insert: {
          baseline_idle_pct?: number
          code: string
          id?: string
          idle_fuel_lph?: number | null
          machine_type: string
          name: string
          rated_rpm?: number | null
          source_url?: string | null
          work_fuel_lph?: number | null
        }
        Update: {
          baseline_idle_pct?: number
          code?: string
          id?: string
          idle_fuel_lph?: number | null
          machine_type?: string
          name?: string
          rated_rpm?: number | null
          source_url?: string | null
          work_fuel_lph?: number | null
        }
        Relationships: []
      }
      machine_state: {
        Row: {
          active_anomaly_ids: string[]
          coolant_temp_c: number | null
          health: Database["public"]["Enums"]["machine_health"]
          hydraulic_temp_c: number | null
          load_cycles: number | null
          location: unknown
          machine_id: string
          moving: boolean
          operator_id: string | null
          parking_brake: boolean | null
          pitch_deg: number | null
          roll_deg: number | null
          run_id: string
          seatbelt_fastened: boolean | null
          speed_kmh: number | null
          ts: string
          updated_at: string
        }
        Insert: {
          active_anomaly_ids?: string[]
          coolant_temp_c?: number | null
          health?: Database["public"]["Enums"]["machine_health"]
          hydraulic_temp_c?: number | null
          load_cycles?: number | null
          location?: unknown
          machine_id: string
          moving?: boolean
          operator_id?: string | null
          parking_brake?: boolean | null
          pitch_deg?: number | null
          roll_deg?: number | null
          run_id: string
          seatbelt_fastened?: boolean | null
          speed_kmh?: number | null
          ts: string
          updated_at?: string
        }
        Update: {
          active_anomaly_ids?: string[]
          coolant_temp_c?: number | null
          health?: Database["public"]["Enums"]["machine_health"]
          hydraulic_temp_c?: number | null
          load_cycles?: number | null
          location?: unknown
          machine_id?: string
          moving?: boolean
          operator_id?: string | null
          parking_brake?: boolean | null
          pitch_deg?: number | null
          roll_deg?: number | null
          run_id?: string
          seatbelt_fastened?: boolean | null
          speed_kmh?: number | null
          ts?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_state_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_state_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_state_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          assumed: boolean
          code: string
          home_site_id: string | null
          id: string
          manufacture_year: number | null
          model_id: string | null
          serial_number: string | null
          service_status: string
        }
        Insert: {
          assumed?: boolean
          code: string
          home_site_id?: string | null
          id?: string
          manufacture_year?: number | null
          model_id?: string | null
          serial_number?: string | null
          service_status?: string
        }
        Update: {
          assumed?: boolean
          code?: string
          home_site_id?: string | null
          id?: string
          manufacture_year?: number | null
          model_id?: string | null
          serial_number?: string | null
          service_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_home_site_id_fkey"
            columns: ["home_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "machine_models"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_gps_trail: {
        Row: {
          accuracy_m: number | null
          id: number
          location: unknown
          operator_id: string
          run_id: string | null
          speed_kmh: number | null
          ts: string
        }
        Insert: {
          accuracy_m?: number | null
          id?: never
          location: unknown
          operator_id: string
          run_id?: string | null
          speed_kmh?: number | null
          ts: string
        }
        Update: {
          accuracy_m?: number | null
          id?: never
          location?: unknown
          operator_id?: string
          run_id?: string | null
          speed_kmh?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_gps_trail_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_gps_trail_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_pairings: {
        Row: {
          id: string
          machine_id: string
          operator_id: string
          paired_at: string
          run_id: string | null
          unpaired_at: string | null
        }
        Insert: {
          id?: string
          machine_id: string
          operator_id: string
          paired_at?: string
          run_id?: string | null
          unpaired_at?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          operator_id?: string
          paired_at?: string
          run_id?: string | null
          unpaired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_pairings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_pairings_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_pairings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_state: {
        Row: {
          call_allowed: boolean
          in_cab_machine_id: string | null
          location: unknown
          motion_locked: boolean
          nearest: Json | null
          on_foot: boolean | null
          operator_id: string
          ppe: Json
          run_id: string
          ts: string
          updated_at: string
        }
        Insert: {
          call_allowed?: boolean
          in_cab_machine_id?: string | null
          location?: unknown
          motion_locked?: boolean
          nearest?: Json | null
          on_foot?: boolean | null
          operator_id: string
          ppe?: Json
          run_id: string
          ts: string
          updated_at?: string
        }
        Update: {
          call_allowed?: boolean
          in_cab_machine_id?: string | null
          location?: unknown
          motion_locked?: boolean
          nearest?: Json | null
          on_foot?: boolean | null
          operator_id?: string
          ppe?: Json
          run_id?: string
          ts?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_state_in_cab_machine_id_fkey"
            columns: ["in_cab_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_state_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_state_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          contact_ref: string | null
          display_name: string
          employee_code: string
          experience_hours: number
          id: string
          preferred_language: Database["public"]["Enums"]["lang"]
          pseudonym: string
          site_id: string
          skill_level: Database["public"]["Enums"]["skill_level"]
        }
        Insert: {
          contact_ref?: string | null
          display_name: string
          employee_code: string
          experience_hours?: number
          id?: string
          preferred_language?: Database["public"]["Enums"]["lang"]
          pseudonym: string
          site_id: string
          skill_level: Database["public"]["Enums"]["skill_level"]
        }
        Update: {
          contact_ref?: string | null
          display_name?: string
          employee_code?: string
          experience_hours?: number
          id?: string
          preferred_language?: Database["public"]["Enums"]["lang"]
          pseudonym?: string
          site_id?: string
          skill_level?: Database["public"]["Enums"]["skill_level"]
        }
        Relationships: [
          {
            foreignKeyName: "operators_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ppe_overrides: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          ledger_queue_id: number | null
          missing: string[]
          operator_id: string
          reason: string
          task_id: string
          valid_until: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          ledger_queue_id?: number | null
          missing: string[]
          operator_id: string
          reason: string
          task_id: string
          valid_until: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          ledger_queue_id?: number | null
          missing?: string[]
          operator_id?: string
          reason?: string
          task_id?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppe_overrides_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppe_overrides_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string
          language: Database["public"]["Enums"]["lang"]
          operator_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          site_id: string
          user_id: string
        }
        Insert: {
          display_name: string
          language?: Database["public"]["Enums"]["lang"]
          operator_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          site_id: string
          user_id: string
        }
        Update: {
          display_name?: string
          language?: Database["public"]["Enums"]["lang"]
          operator_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_cards: {
        Row: {
          audio_paths: Json | null
          fault_type: string
          id: string
          pictogram: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_refs: string[]
          steps: Json
          title: Json
          upwind_hint: boolean
          version: number
        }
        Insert: {
          audio_paths?: Json | null
          fault_type: string
          id: string
          pictogram: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_refs?: string[]
          steps: Json
          title: Json
          upwind_hint?: boolean
          version?: number
        }
        Update: {
          audio_paths?: Json | null
          fault_type?: string
          id?: string
          pictogram?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_refs?: string[]
          steps?: Json
          title?: Json
          upwind_hint?: boolean
          version?: number
        }
        Relationships: []
      }
      scenario_frames: {
        Row: {
          kind: Database["public"]["Enums"]["frame_kind"]
          machine_id: string | null
          operator_id: string | null
          payload: Json
          scenario_id: string
          seq: number
          sim_offset_ms: number
        }
        Insert: {
          kind: Database["public"]["Enums"]["frame_kind"]
          machine_id?: string | null
          operator_id?: string | null
          payload: Json
          scenario_id: string
          seq: number
          sim_offset_ms: number
        }
        Update: {
          kind?: Database["public"]["Enums"]["frame_kind"]
          machine_id?: string | null
          operator_id?: string | null
          payload?: Json
          scenario_id?: string
          seq?: number
          sim_offset_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_frames_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_frames_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_frames_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_runs: {
        Row: {
          catchup_until_seq: number | null
          created_at: string
          created_by: string | null
          cursor_seq: number
          dry_run_external: boolean
          id: string
          is_current: boolean
          rehearsal: boolean
          scenario_id: string
          sim_anchor: string
          speed: number
          status: Database["public"]["Enums"]["run_status"]
          wall_anchor: string
        }
        Insert: {
          catchup_until_seq?: number | null
          created_at?: string
          created_by?: string | null
          cursor_seq?: number
          dry_run_external?: boolean
          id?: string
          is_current?: boolean
          rehearsal?: boolean
          scenario_id: string
          sim_anchor: string
          speed?: number
          status?: Database["public"]["Enums"]["run_status"]
          wall_anchor?: string
        }
        Update: {
          catchup_until_seq?: number | null
          created_at?: string
          created_by?: string | null
          cursor_seq?: number
          dry_run_external?: boolean
          id?: string
          is_current?: boolean
          rehearsal?: boolean
          scenario_id?: string
          sim_anchor?: string
          speed?: number
          status?: Database["public"]["Enums"]["run_status"]
          wall_anchor?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          code: string
          duration: string
          frame_count: number
          generator_version: string
          id: string
          seed: number
          shift_start_sim: string
          site_id: string
        }
        Insert: {
          code: string
          duration: string
          frame_count?: number
          generator_version: string
          id?: string
          seed: number
          shift_start_sim: string
          site_id: string
        }
        Update: {
          code?: string
          duration?: string
          frame_count?: number
          generator_version?: string
          id?: string
          seed?: number
          shift_start_sim?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          id: string
          machine_id: string | null
          operator_id: string
          run_id: string | null
          scheduled_end: string
          scheduled_start: string
          shift_type: string
          site_id: string
          status: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          id?: string
          machine_id?: string | null
          operator_id: string
          run_id?: string | null
          scheduled_end: string
          scheduled_start: string
          shift_type: string
          site_id: string
          status?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          id?: string
          machine_id?: string | null
          operator_id?: string
          run_id?: string | null
          scheduled_end?: string
          scheduled_start?: string
          shift_type?: string
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          code: string
          elevation_m: number | null
          id: string
          location: unknown
          name: string
          site_type: string
          timezone: string
        }
        Insert: {
          code: string
          elevation_m?: number | null
          id?: string
          location: unknown
          name: string
          site_type: string
          timezone?: string
        }
        Update: {
          code?: string
          elevation_m?: number | null
          id?: string
          location?: unknown
          name?: string
          site_type?: string
          timezone?: string
        }
        Relationships: []
      }
      task_history: {
        Row: {
          actual_min: number
          external_ref: string
          humidity_pct: number | null
          id: string
          machine_age_years: number
          machine_id: string | null
          material: string | null
          model_p50_min: number | null
          model_p90_min: number | null
          operator_id: string | null
          operator_skill: Database["public"]["Enums"]["skill_level"]
          organiser_estimate_min: number
          shift_hour: number | null
          site_id: string | null
          source: string
          split: string
          started_at: string | null
          task_type: Database["public"]["Enums"]["task_type"]
          temperature_c: number | null
          weather: Database["public"]["Enums"]["weather_kind"]
          weather_raw: string | null
          wind_kmh: number | null
        }
        Insert: {
          actual_min: number
          external_ref: string
          humidity_pct?: number | null
          id?: string
          machine_age_years: number
          machine_id?: string | null
          material?: string | null
          model_p50_min?: number | null
          model_p90_min?: number | null
          operator_id?: string | null
          operator_skill: Database["public"]["Enums"]["skill_level"]
          organiser_estimate_min: number
          shift_hour?: number | null
          site_id?: string | null
          source: string
          split: string
          started_at?: string | null
          task_type: Database["public"]["Enums"]["task_type"]
          temperature_c?: number | null
          weather: Database["public"]["Enums"]["weather_kind"]
          weather_raw?: string | null
          wind_kmh?: number | null
        }
        Update: {
          actual_min?: number
          external_ref?: string
          humidity_pct?: number | null
          id?: string
          machine_age_years?: number
          machine_id?: string | null
          material?: string | null
          model_p50_min?: number | null
          model_p90_min?: number | null
          operator_id?: string | null
          operator_skill?: Database["public"]["Enums"]["skill_level"]
          organiser_estimate_min?: number
          shift_hour?: number | null
          site_id?: string | null
          source?: string
          split?: string
          started_at?: string | null
          task_type?: Database["public"]["Enums"]["task_type"]
          temperature_c?: number | null
          weather?: Database["public"]["Enums"]["weather_kind"]
          weather_raw?: string | null
          wind_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          cycles_at_start: number | null
          eta_factors: Json | null
          eta_model_version: string | null
          eta_p50_min: number | null
          eta_p90_min: number | null
          external_ref: string | null
          id: string
          machine_id: string | null
          operator_id: string
          paused_at: string | null
          planned_cycles: number
          planned_start: string
          ppe_override_id: string | null
          progress_pct: number
          run_id: string | null
          shift_id: string | null
          site_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          completed_at?: string | null
          cycles_at_start?: number | null
          eta_factors?: Json | null
          eta_model_version?: string | null
          eta_p50_min?: number | null
          eta_p90_min?: number | null
          external_ref?: string | null
          id?: string
          machine_id?: string | null
          operator_id: string
          paused_at?: string | null
          planned_cycles: number
          planned_start: string
          ppe_override_id?: string | null
          progress_pct?: number
          run_id?: string | null
          shift_id?: string | null
          site_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          completed_at?: string | null
          cycles_at_start?: number | null
          eta_factors?: Json | null
          eta_model_version?: string | null
          eta_p50_min?: number | null
          eta_p90_min?: number | null
          external_ref?: string | null
          id?: string
          machine_id?: string | null
          operator_id?: string
          paused_at?: string | null
          planned_cycles?: number
          planned_start?: string
          ppe_override_id?: string | null
          progress_pct?: number
          run_id?: string | null
          shift_id?: string | null
          site_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_ppe_override_id_fkey"
            columns: ["ppe_override_id"]
            isOneToOne: false
            referencedRelation: "ppe_overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_readings: {
        Row: {
          coolant_temp_c: number | null
          def_pct: number | null
          engine_hours: number | null
          engine_load_pct: number | null
          frame_seq: number | null
          fuel_level_pct: number | null
          fuel_used_l: number | null
          hydraulic_pressure_bar: number | null
          hydraulic_temp_c: number | null
          id: number
          idle_hours: number | null
          load_cycles: number | null
          location: unknown
          machine_id: string
          operator_id: string | null
          organiser_safety_alert: string | null
          parking_brake: boolean | null
          pitch_deg: number | null
          roll_deg: number | null
          rpm: number | null
          run_id: string | null
          seatbelt_fastened: boolean | null
          speed_kmh: number | null
          ts: string
        }
        Insert: {
          coolant_temp_c?: number | null
          def_pct?: number | null
          engine_hours?: number | null
          engine_load_pct?: number | null
          frame_seq?: number | null
          fuel_level_pct?: number | null
          fuel_used_l?: number | null
          hydraulic_pressure_bar?: number | null
          hydraulic_temp_c?: number | null
          id?: never
          idle_hours?: number | null
          load_cycles?: number | null
          location?: unknown
          machine_id: string
          operator_id?: string | null
          organiser_safety_alert?: string | null
          parking_brake?: boolean | null
          pitch_deg?: number | null
          roll_deg?: number | null
          rpm?: number | null
          run_id?: string | null
          seatbelt_fastened?: boolean | null
          speed_kmh?: number | null
          ts: string
        }
        Update: {
          coolant_temp_c?: number | null
          def_pct?: number | null
          engine_hours?: number | null
          engine_load_pct?: number | null
          frame_seq?: number | null
          fuel_level_pct?: number | null
          fuel_used_l?: number | null
          hydraulic_pressure_bar?: number | null
          hydraulic_temp_c?: number | null
          id?: never
          idle_hours?: number | null
          load_cycles?: number | null
          location?: unknown
          machine_id?: string
          operator_id?: string | null
          organiser_safety_alert?: string | null
          parking_brake?: boolean | null
          pitch_deg?: number | null
          roll_deg?: number | null
          rpm?: number | null
          run_id?: string | null
          seatbelt_fastened?: boolean | null
          speed_kmh?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_readings_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_readings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_snapshots: {
        Row: {
          apparent_temperature_c: number | null
          forecast_peak_at: string | null
          forecast_peak_c: number | null
          humidity_pct: number | null
          id: string
          precipitation_mm: number | null
          run_id: string | null
          shortwave_wm2: number | null
          site_id: string
          source: string
          temperature_c: number
          ts: string
          wbgt_c: number | null
          weather_code: number | null
          wind_chill_c: number | null
          wind_from_deg: number | null
          wind_gust_kmh: number | null
          wind_kmh: number
        }
        Insert: {
          apparent_temperature_c?: number | null
          forecast_peak_at?: string | null
          forecast_peak_c?: number | null
          humidity_pct?: number | null
          id?: string
          precipitation_mm?: number | null
          run_id?: string | null
          shortwave_wm2?: number | null
          site_id: string
          source?: string
          temperature_c: number
          ts: string
          wbgt_c?: number | null
          weather_code?: number | null
          wind_chill_c?: number | null
          wind_from_deg?: number | null
          wind_gust_kmh?: number | null
          wind_kmh: number
        }
        Update: {
          apparent_temperature_c?: number | null
          forecast_peak_at?: string | null
          forecast_peak_c?: number | null
          humidity_pct?: number | null
          id?: string
          precipitation_mm?: number | null
          run_id?: string | null
          shortwave_wm2?: number | null
          site_id?: string
          source?: string
          temperature_c?: number
          ts?: string
          wbgt_c?: number | null
          weather_code?: number | null
          wind_chill_c?: number | null
          wind_from_deg?: number | null
          wind_gust_kmh?: number | null
          wind_kmh?: number
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scenario_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_snapshots_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          boundary: unknown
          id: string
          max_slope_deg: number | null
          max_speed_kmh: number | null
          name: string
          site_id: string
          zone_type: string
        }
        Insert: {
          boundary: unknown
          id?: string
          max_slope_deg?: number | null
          max_speed_kmh?: number | null
          name: string
          site_id: string
          zone_type: string
        }
        Update: {
          boundary?: unknown
          id?: string
          max_slope_deg?: number | null
          max_speed_kmh?: number | null
          name?: string
          site_id?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_task_analytics: {
        Row: {
          bias_model_min: number | null
          bias_organiser_min: number | null
          condition: Database["public"]["Enums"]["weather_kind"] | null
          mae_model_min: number | null
          mae_organiser_min: number | null
          mean_actual_min: number | null
          mean_model_p50_min: number | null
          mean_organiser_estimate_min: number | null
          n: number | null
          task_type: Database["public"]["Enums"]["task_type"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ack_via: "app" | "telegram" | "twilio_keypress" | "sensor"
      alert_kind:
        | "seatbelt_off_moving"
        | "guardian_hazard"
        | "proximity_zone"
        | "ppe_missing"
        | "anomaly_machine"
        | "idle_excess"
        | "sos"
        | "ledger_tamper"
        | "alert_flood"
      alert_status:
        | "open"
        | "acknowledged"
        | "escalating"
        | "escalated"
        | "resolved"
        | "suppressed"
      alert_tier: "info" | "caution" | "warning" | "critical"
      anomaly_type:
        | "idle_excess"
        | "seatbelt_off_moving"
        | "overspeed"
        | "slope_exceeded"
        | "fault_continued_operation"
        | "hydraulic_temp_drift"
        | "coolant_temp_drift"
      app_role: "operator" | "fleet_manager" | "trainer"
      audience: "operator" | "site" | "supervisor" | "trainer"
      dispatch_channel: "telegram" | "twilio_voice"
      dispatch_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "answered"
        | "no_answer"
        | "failed"
        | "suppressed"
        | "dry_run"
      fault_severity: "info" | "caution" | "derate" | "shutdown"
      frame_kind:
        | "telemetry"
        | "gps"
        | "operator_state"
        | "weather"
        | "fault"
        | "ppe"
      incident_type:
        | "seatbelt_breach"
        | "guardian_hazard"
        | "sos"
        | "ppe_override"
        | "near_miss"
        | "first_aid"
        | "property_damage"
        | "manual"
        | "correction"
      lang: "en" | "hi" | "ta"
      machine_health: "ok" | "caution" | "fault"
      photo_category:
        | "hydraulic_leak"
        | "fuel_leak"
        | "coolant_leak"
        | "tyre_damage"
        | "structural_crack"
        | "fire_smoke"
        | "ppe_issue"
        | "unknown"
      ppe_item: "helmet" | "vest" | "boots" | "gloves"
      proximity_zone: "awareness" | "warning" | "danger"
      run_status: "ready" | "playing" | "paused" | "finished"
      skill_level: "novice" | "intermediate" | "expert"
      suppress_reason:
        | "dedupe"
        | "lower_tier"
        | "rate_cap"
        | "catch_up"
        | "motion_lock"
        | "call_cooldown"
        | "state_unknown"
        | "acknowledged"
        | "dry_run"
      task_status:
        | "planned"
        | "in_progress"
        | "paused"
        | "completed"
        | "cancelled"
        | "blocked_ppe"
      task_type:
        | "excavation"
        | "trenching"
        | "material_loading"
        | "grading"
        | "demolition"
      weather_kind: "clear" | "hot" | "rain" | "windy" | "cold" | "fog" | "dust"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ack_via: ["app", "telegram", "twilio_keypress", "sensor"],
      alert_kind: [
        "seatbelt_off_moving",
        "guardian_hazard",
        "proximity_zone",
        "ppe_missing",
        "anomaly_machine",
        "idle_excess",
        "sos",
        "ledger_tamper",
        "alert_flood",
      ],
      alert_status: [
        "open",
        "acknowledged",
        "escalating",
        "escalated",
        "resolved",
        "suppressed",
      ],
      alert_tier: ["info", "caution", "warning", "critical"],
      anomaly_type: [
        "idle_excess",
        "seatbelt_off_moving",
        "overspeed",
        "slope_exceeded",
        "fault_continued_operation",
        "hydraulic_temp_drift",
        "coolant_temp_drift",
      ],
      app_role: ["operator", "fleet_manager", "trainer"],
      audience: ["operator", "site", "supervisor", "trainer"],
      dispatch_channel: ["telegram", "twilio_voice"],
      dispatch_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "answered",
        "no_answer",
        "failed",
        "suppressed",
        "dry_run",
      ],
      fault_severity: ["info", "caution", "derate", "shutdown"],
      frame_kind: [
        "telemetry",
        "gps",
        "operator_state",
        "weather",
        "fault",
        "ppe",
      ],
      incident_type: [
        "seatbelt_breach",
        "guardian_hazard",
        "sos",
        "ppe_override",
        "near_miss",
        "first_aid",
        "property_damage",
        "manual",
        "correction",
      ],
      lang: ["en", "hi", "ta"],
      machine_health: ["ok", "caution", "fault"],
      photo_category: [
        "hydraulic_leak",
        "fuel_leak",
        "coolant_leak",
        "tyre_damage",
        "structural_crack",
        "fire_smoke",
        "ppe_issue",
        "unknown",
      ],
      ppe_item: ["helmet", "vest", "boots", "gloves"],
      proximity_zone: ["awareness", "warning", "danger"],
      run_status: ["ready", "playing", "paused", "finished"],
      skill_level: ["novice", "intermediate", "expert"],
      suppress_reason: [
        "dedupe",
        "lower_tier",
        "rate_cap",
        "catch_up",
        "motion_lock",
        "call_cooldown",
        "state_unknown",
        "acknowledged",
        "dry_run",
      ],
      task_status: [
        "planned",
        "in_progress",
        "paused",
        "completed",
        "cancelled",
        "blocked_ppe",
      ],
      task_type: [
        "excavation",
        "trenching",
        "material_loading",
        "grading",
        "demolition",
      ],
      weather_kind: ["clear", "hot", "rain", "windy", "cold", "fog", "dust"],
    },
  },
} as const
