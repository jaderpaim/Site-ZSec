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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_devices: {
        Row: {
          agent_version: string | null
          ai_apps: Json
          ai_apps_at: string | null
          arch: string | null
          first_seen_at: string
          hostname: string | null
          id: string
          last_os_user: string | null
          last_seen_at: string
          last_user: string | null
          os: string | null
          os_version: string | null
          user_resolved: boolean
        }
        Insert: {
          agent_version?: string | null
          ai_apps?: Json
          ai_apps_at?: string | null
          arch?: string | null
          first_seen_at?: string
          hostname?: string | null
          id: string
          last_os_user?: string | null
          last_seen_at?: string
          last_user?: string | null
          os?: string | null
          os_version?: string | null
          user_resolved?: boolean
        }
        Update: {
          agent_version?: string | null
          ai_apps?: Json
          ai_apps_at?: string | null
          arch?: string | null
          first_seen_at?: string
          hostname?: string | null
          id?: string
          last_os_user?: string | null
          last_seen_at?: string
          last_user?: string | null
          os?: string | null
          os_version?: string | null
          user_resolved?: boolean
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          http_status: number | null
          id: string
          message: string | null
          provider: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          http_status?: number | null
          id?: string
          message?: string | null
          provider: string
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          http_status?: number | null
          id?: string
          message?: string | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      applications: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      aprovadores: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          email: string
          id: string
          nome: string
          ordem: number
          papel: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          email: string
          id?: string
          nome: string
          ordem: number
          papel?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          email?: string
          id?: string
          nome?: string
          ordem?: number
          papel?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          duration_ms: number | null
          id: string
          message: string | null
          status: string
          user_email: string | null
          zone_id: string | null
          zone_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          id?: string
          message?: string | null
          status: string
          user_email?: string | null
          zone_id?: string | null
          zone_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          id?: string
          message?: string | null
          status?: string
          user_email?: string | null
          zone_id?: string | null
          zone_name?: string | null
        }
        Relationships: []
      }
      auth_access_logs: {
        Row: {
          created_at: string
          email: string
          error_message: string | null
          event_type: string
          full_name: string | null
          id: string
          ip: string | null
          login_method: string | null
          logout_reason: string | null
          role: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          error_message?: string | null
          event_type?: string
          full_name?: string | null
          id?: string
          ip?: string | null
          login_method?: string | null
          logout_reason?: string | null
          role?: string | null
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          error_message?: string | null
          event_type?: string
          full_name?: string | null
          id?: string
          ip?: string | null
          login_method?: string | null
          logout_reason?: string | null
          role?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      benchmark_empresa: {
        Row: {
          ano: number
          created_at: string
          faturamento_anual: number | null
          id: string
          investimento_ciber: number | null
          score_maturidade: number | null
          updated_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          faturamento_anual?: number | null
          id?: string
          investimento_ciber?: number | null
          score_maturidade?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          faturamento_anual?: number | null
          id?: string
          investimento_ciber?: number | null
          score_maturidade?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      benchmark_investimento_ref: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          ordem: number
          pct_max: number | null
          pct_min: number | null
          tipo_organizacao: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string | null
          ordem?: number
          pct_max?: number | null
          pct_min?: number | null
          tipo_organizacao: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          ordem?: number
          pct_max?: number | null
          pct_min?: number | null
          tipo_organizacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      benchmark_maturidade_ref: {
        Row: {
          ano: string | null
          created_at: string
          faixa: string
          fonte: string | null
          id: string
          is_propria: boolean
          ordem: number
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          ano?: string | null
          created_at?: string
          faixa: string
          fonte?: string | null
          id?: string
          is_propria?: boolean
          ordem?: number
          tipo: string
          updated_at?: string
          valor: number
        }
        Update: {
          ano?: string | null
          created_at?: string
          faixa?: string
          fonte?: string | null
          id?: string
          is_propria?: boolean
          ordem?: number
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      cloudflare_dns_records: {
        Row: {
          comment: string | null
          content: string | null
          created_on: string | null
          id: string
          modified_on: string | null
          name: string
          proxied: boolean | null
          raw: Json | null
          synced_at: string
          tags: string[] | null
          ttl: number | null
          type: string
          zone_id: string
          zone_name: string | null
        }
        Insert: {
          comment?: string | null
          content?: string | null
          created_on?: string | null
          id: string
          modified_on?: string | null
          name: string
          proxied?: boolean | null
          raw?: Json | null
          synced_at?: string
          tags?: string[] | null
          ttl?: number | null
          type: string
          zone_id: string
          zone_name?: string | null
        }
        Update: {
          comment?: string | null
          content?: string | null
          created_on?: string | null
          id?: string
          modified_on?: string | null
          name?: string
          proxied?: boolean | null
          raw?: Json | null
          synced_at?: string
          tags?: string[] | null
          ttl?: number | null
          type?: string
          zone_id?: string
          zone_name?: string | null
        }
        Relationships: []
      }
      cloudflare_firewall_events: {
        Row: {
          action: string | null
          client_ip: string | null
          country: string | null
          datetime: string
          host: string | null
          id: string
          method: string | null
          path: string | null
          raw: Json | null
          rule_id: string | null
          synced_at: string
          user_agent: string | null
          zone_id: string
        }
        Insert: {
          action?: string | null
          client_ip?: string | null
          country?: string | null
          datetime: string
          host?: string | null
          id: string
          method?: string | null
          path?: string | null
          raw?: Json | null
          rule_id?: string | null
          synced_at?: string
          user_agent?: string | null
          zone_id: string
        }
        Update: {
          action?: string | null
          client_ip?: string | null
          country?: string | null
          datetime?: string
          host?: string | null
          id?: string
          method?: string | null
          path?: string | null
          raw?: Json | null
          rule_id?: string | null
          synced_at?: string
          user_agent?: string | null
          zone_id?: string
        }
        Relationships: []
      }
      cloudflare_snapshots: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          payload: Json
          range_days: number
          zone_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          id?: string
          payload: Json
          range_days: number
          zone_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          payload?: Json
          range_days?: number
          zone_id?: string
        }
        Relationships: []
      }
      cloudflare_sync_state: {
        Row: {
          account_id: string
          last_dns_synced_at: string | null
          last_events_at: string | null
          last_full_sync_at: string | null
          last_zones_synced_at: string | null
          updated_at: string
          zone_id: string
        }
        Insert: {
          account_id: string
          last_dns_synced_at?: string | null
          last_events_at?: string | null
          last_full_sync_at?: string | null
          last_zones_synced_at?: string | null
          updated_at?: string
          zone_id?: string
        }
        Update: {
          account_id?: string
          last_dns_synced_at?: string | null
          last_events_at?: string | null
          last_full_sync_at?: string | null
          last_zones_synced_at?: string | null
          updated_at?: string
          zone_id?: string
        }
        Relationships: []
      }
      cloudflare_zones: {
        Row: {
          account_id: string | null
          account_name: string | null
          id: string
          name: string
          paused: boolean | null
          raw: Json | null
          status: string | null
          synced_at: string
          type: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          id: string
          name: string
          paused?: boolean | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
          type?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          id?: string
          name?: string
          paused?: boolean | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
          type?: string | null
        }
        Relationships: []
      }
      cmdb_ativos: {
        Row: {
          created_at: string
          created_by: string | null
          criticidade: string
          departamento_id: string | null
          fabricante_modelo: string | null
          id: string
          ip_hostname: string | null
          localizacao: string | null
          nome: string
          observacoes: string | null
          responsavel_id: string | null
          sistema_operacional: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criticidade: string
          departamento_id?: string | null
          fabricante_modelo?: string | null
          id?: string
          ip_hostname?: string | null
          localizacao?: string | null
          nome: string
          observacoes?: string | null
          responsavel_id?: string | null
          sistema_operacional?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criticidade?: string
          departamento_id?: string | null
          fabricante_modelo?: string | null
          id?: string
          ip_hostname?: string | null
          localizacao?: string | null
          nome?: string
          observacoes?: string | null
          responsavel_id?: string | null
          sistema_operacional?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cmdb_ativos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cmdb_ativos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cmdb_dns_cache: {
        Row: {
          hostname: string | null
          ip: string
          reason: string | null
          resolved: boolean
          synced_at: string
        }
        Insert: {
          hostname?: string | null
          ip: string
          reason?: string | null
          resolved?: boolean
          synced_at?: string
        }
        Update: {
          hostname?: string | null
          ip?: string
          reason?: string | null
          resolved?: boolean
          synced_at?: string
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          cargo: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          display_name: string
          email: string
          entra_oid: string | null
          id: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          display_name: string
          email: string
          entra_oid?: string | null
          id?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          display_name?: string
          email?: string
          entra_oid?: string | null
          id?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      comites: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          id: string
          nome: string
          observacao: string | null
          participantes: string | null
          periodicidade: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          nome: string
          observacao?: string | null
          participantes?: string | null
          periodicidade: string
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          nome?: string
          observacao?: string | null
          participantes?: string | null
          periodicidade?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_http_dispatch_log: {
        Row: {
          dispatched_at: string
          id: number
          job_name: string
          log_id: number
        }
        Insert: {
          dispatched_at?: string
          id: number
          job_name: string
          log_id?: never
        }
        Update: {
          dispatched_at?: string
          id?: number
          job_name?: string
          log_id?: never
        }
        Relationships: []
      }
      cron_job_runs: {
        Row: {
          enabled: boolean
          expected_interval_minutes: number
          hook_path: string | null
          job_name: string
          label: string
          last_attempt_at: string | null
          last_duration_ms: number | null
          last_error: string | null
          last_ok: boolean | null
          last_success_at: string | null
          last_trigger: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          expected_interval_minutes: number
          hook_path?: string | null
          job_name: string
          label: string
          last_attempt_at?: string | null
          last_duration_ms?: number | null
          last_error?: string | null
          last_ok?: boolean | null
          last_success_at?: string | null
          last_trigger?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          expected_interval_minutes?: number
          hook_path?: string | null
          job_name?: string
          label?: string
          last_attempt_at?: string | null
          last_duration_ms?: number | null
          last_error?: string | null
          last_ok?: boolean | null
          last_success_at?: string | null
          last_trigger?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dast_auth_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
          logged_in_indicator: string | null
          login_url: string | null
          password_enc: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          logged_in_indicator?: string | null
          login_url?: string | null
          password_enc: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          logged_in_indicator?: string | null
          login_url?: string | null
          password_enc?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      dast_recon_subdomains: {
        Row: {
          discovered_at: string
          id: string
          ip: string | null
          scan_id: string
          scope: string
          scope_norm: string | null
          source: string | null
          subdomain: string
          subdomain_norm: string | null
        }
        Insert: {
          discovered_at?: string
          id?: string
          ip?: string | null
          scan_id: string
          scope?: string
          scope_norm?: string | null
          source?: string | null
          subdomain: string
          subdomain_norm?: string | null
        }
        Update: {
          discovered_at?: string
          id?: string
          ip?: string | null
          scan_id?: string
          scope?: string
          scope_norm?: string | null
          source?: string | null
          subdomain?: string
          subdomain_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dast_recon_subdomains_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "dast_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      dast_retest_history: {
        Row: {
          engine: string | null
          id: string
          raw_output: Json | null
          result: string
          tested_at: string
          vulnerability_id: string
        }
        Insert: {
          engine?: string | null
          id?: string
          raw_output?: Json | null
          result: string
          tested_at?: string
          vulnerability_id: string
        }
        Update: {
          engine?: string | null
          id?: string
          raw_output?: Json | null
          result?: string
          tested_at?: string
          vulnerability_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dast_retest_history_vulnerability_id_fkey"
            columns: ["vulnerability_id"]
            isOneToOne: false
            referencedRelation: "dast_vulnerabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      dast_scan_out_of_scope_hosts: {
        Row: {
          created_at: string
          host: string
          id: string
          request_count: number
          sample_urls: Json | null
          scan_id: string
        }
        Insert: {
          created_at?: string
          host: string
          id?: string
          request_count?: number
          sample_urls?: Json | null
          scan_id: string
        }
        Update: {
          created_at?: string
          host?: string
          id?: string
          request_count?: number
          sample_urls?: Json | null
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dast_scan_out_of_scope_hosts_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "dast_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      dast_scan_schedules: {
        Row: {
          active: boolean
          config: Json | null
          created_at: string
          domain: string | null
          engines: string[]
          frequency: string | null
          id: string
          level: string | null
          mode: string | null
          name: string | null
          next_run_at: string | null
          run_at_time: string | null
          target_url: string | null
        }
        Insert: {
          active?: boolean
          config?: Json | null
          created_at?: string
          domain?: string | null
          engines?: string[]
          frequency?: string | null
          id?: string
          level?: string | null
          mode?: string | null
          name?: string | null
          next_run_at?: string | null
          run_at_time?: string | null
          target_url?: string | null
        }
        Update: {
          active?: boolean
          config?: Json | null
          created_at?: string
          domain?: string | null
          engines?: string[]
          frequency?: string | null
          id?: string
          level?: string | null
          mode?: string | null
          name?: string | null
          next_run_at?: string | null
          run_at_time?: string | null
          target_url?: string | null
        }
        Relationships: []
      }
      dast_scans: {
        Row: {
          auth_status: string | null
          config: Json | null
          created_at: string
          domain: string | null
          engines: string[]
          environment: string | null
          error: string | null
          estimated_seconds_remaining: number | null
          finished_at: string | null
          id: string
          level: string
          mode: string
          name: string | null
          progress: number
          started_at: string | null
          started_by: string | null
          status: string
          target_url: string | null
          updated_at: string
        }
        Insert: {
          auth_status?: string | null
          config?: Json | null
          created_at?: string
          domain?: string | null
          engines?: string[]
          environment?: string | null
          error?: string | null
          estimated_seconds_remaining?: number | null
          finished_at?: string | null
          id?: string
          level?: string
          mode?: string
          name?: string | null
          progress?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          auth_status?: string | null
          config?: Json | null
          created_at?: string
          domain?: string | null
          engines?: string[]
          environment?: string | null
          error?: string | null
          estimated_seconds_remaining?: number | null
          finished_at?: string | null
          id?: string
          level?: string
          mode?: string
          name?: string | null
          progress?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          target_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dast_vulnerabilities: {
        Row: {
          attack_payload: string | null
          business_impact: string | null
          confidence: string | null
          cve_id: string | null
          cvss_score: number | null
          description: string | null
          engine: string | null
          engine_norm: string | null
          evidence: string | null
          first_seen_at: string
          found_at: string
          http_method: string | null
          id: string
          matched_url: string | null
          matched_url_norm: string | null
          name: string
          name_norm: string | null
          occurrence_count: number
          owasp_category: string | null
          param: string | null
          param_norm: string | null
          raw_output: Json | null
          reference: string | null
          remediation: string | null
          reopened_at: string | null
          scan_id: string
          severity: string | null
          should_alert: boolean | null
          status: string
          sub_key: string | null
          sub_key_norm: string | null
        }
        Insert: {
          attack_payload?: string | null
          business_impact?: string | null
          confidence?: string | null
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          engine?: string | null
          engine_norm?: string | null
          evidence?: string | null
          first_seen_at?: string
          found_at?: string
          http_method?: string | null
          id?: string
          matched_url?: string | null
          matched_url_norm?: string | null
          name: string
          name_norm?: string | null
          occurrence_count?: number
          owasp_category?: string | null
          param?: string | null
          param_norm?: string | null
          raw_output?: Json | null
          reference?: string | null
          remediation?: string | null
          reopened_at?: string | null
          scan_id: string
          severity?: string | null
          should_alert?: boolean | null
          status?: string
          sub_key?: string | null
          sub_key_norm?: string | null
        }
        Update: {
          attack_payload?: string | null
          business_impact?: string | null
          confidence?: string | null
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          engine?: string | null
          engine_norm?: string | null
          evidence?: string | null
          first_seen_at?: string
          found_at?: string
          http_method?: string | null
          id?: string
          matched_url?: string | null
          matched_url_norm?: string | null
          name?: string
          name_norm?: string | null
          occurrence_count?: number
          owasp_category?: string | null
          param?: string | null
          param_norm?: string | null
          raw_output?: Json | null
          reference?: string | null
          remediation?: string | null
          reopened_at?: string | null
          scan_id?: string
          severity?: string | null
          should_alert?: boolean | null
          status?: string
          sub_key?: string | null
          sub_key_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dast_vulnerabilities_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "dast_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          emails: string[]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          emails?: string[]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          emails?: string[]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      dlp_events: {
        Row: {
          client_ip: string | null
          collected_at: string
          creation_time: string | null
          file_name: string | null
          file_url: string | null
          id: string
          microsoft_event_id: string
          operation: string | null
          policy_name: string | null
          raw_event: Json
          rule_name: string | null
          sensitive_info: Json | null
          status: string
          user_id: string | null
          workload: string | null
        }
        Insert: {
          client_ip?: string | null
          collected_at?: string
          creation_time?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          microsoft_event_id: string
          operation?: string | null
          policy_name?: string | null
          raw_event: Json
          rule_name?: string | null
          sensitive_info?: Json | null
          status?: string
          user_id?: string | null
          workload?: string | null
        }
        Update: {
          client_ip?: string | null
          collected_at?: string
          creation_time?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          microsoft_event_id?: string
          operation?: string | null
          policy_name?: string | null
          raw_event?: Json
          rule_name?: string | null
          sensitive_info?: Json | null
          status?: string
          user_id?: string | null
          workload?: string | null
        }
        Relationships: []
      }
      dlp_sync_state: {
        Row: {
          id: string
          last_collection: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          last_collection?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          last_collection?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          alert_days: number
          created_at: string
          created_by: string | null
          created_date: string | null
          domain_name: string
          expiry_date: string | null
          id: string
          last_alert_sent_at: string | null
          last_changed_date: string | null
          last_check_error: string | null
          last_checked_at: string | null
          registrar: string
          status: string
          updated_at: string
        }
        Insert: {
          alert_days?: number
          created_at?: string
          created_by?: string | null
          created_date?: string | null
          domain_name: string
          expiry_date?: string | null
          id?: string
          last_alert_sent_at?: string | null
          last_changed_date?: string | null
          last_check_error?: string | null
          last_checked_at?: string | null
          registrar?: string
          status?: string
          updated_at?: string
        }
        Update: {
          alert_days?: number
          created_at?: string
          created_by?: string | null
          created_date?: string | null
          domain_name?: string
          expiry_date?: string | null
          id?: string
          last_alert_sent_at?: string | null
          last_changed_date?: string | null
          last_check_error?: string | null
          last_checked_at?: string | null
          registrar?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          related_gmud_id: string | null
          status: string
          subject: string | null
          template: string | null
          to_email: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          related_gmud_id?: string | null
          status: string
          subject?: string | null
          template?: string | null
          to_email: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          related_gmud_id?: string | null
          status?: string
          subject?: string | null
          template?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_related_gmud_id_fkey"
            columns: ["related_gmud_id"]
            isOneToOne: false
            referencedRelation: "gmuds"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          custom_html: string | null
          id: string
          mode: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custom_html?: string | null
          id?: string
          mode?: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custom_html?: string | null
          id?: string
          mode?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          alert_days: number
          created_at: string
          created_by: string | null
          data_contratacao: string
          data_expiracao: string | null
          department_id: string | null
          id: string
          last_alert_sent_at: string | null
          nome: string
          servico_prestado: string
          updated_at: string
        }
        Insert: {
          alert_days?: number
          created_at?: string
          created_by?: string | null
          data_contratacao: string
          data_expiracao?: string | null
          department_id?: string | null
          id?: string
          last_alert_sent_at?: string | null
          nome: string
          servico_prestado: string
          updated_at?: string
        }
        Update: {
          alert_days?: number
          created_at?: string
          created_by?: string | null
          data_contratacao?: string
          data_expiracao?: string | null
          department_id?: string | null
          id?: string
          last_alert_sent_at?: string | null
          nome?: string
          servico_prestado?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      gmud_aprovadores: {
        Row: {
          created_at: string
          data_acao: string | null
          department_id: string | null
          email_aprovador: string
          gmud_id: string
          id: string
          lembrado_em: string | null
          nome_aprovador: string
          notificado_em: string | null
          observacoes: string | null
          ordem: number
          papel: string | null
          status_aprovacao: Database["public"]["Enums"]["gmud_aprov_status"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data_acao?: string | null
          department_id?: string | null
          email_aprovador: string
          gmud_id: string
          id?: string
          lembrado_em?: string | null
          nome_aprovador: string
          notificado_em?: string | null
          observacoes?: string | null
          ordem?: number
          papel?: string | null
          status_aprovacao?: Database["public"]["Enums"]["gmud_aprov_status"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data_acao?: string | null
          department_id?: string | null
          email_aprovador?: string
          gmud_id?: string
          id?: string
          lembrado_em?: string | null
          nome_aprovador?: string
          notificado_em?: string | null
          observacoes?: string | null
          ordem?: number
          papel?: string | null
          status_aprovacao?: Database["public"]["Enums"]["gmud_aprov_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmud_aprovadores_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmud_aprovadores_gmud_id_fkey"
            columns: ["gmud_id"]
            isOneToOne: false
            referencedRelation: "gmuds"
            referencedColumns: ["id"]
          },
        ]
      }
      gmud_logs: {
        Row: {
          created_at: string
          descricao: string
          detalhes: Json | null
          gmud_id: string | null
          gmud_titulo: string | null
          id: string
          status: string
          tipo_evento: string
          usuario_email: string | null
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          detalhes?: Json | null
          gmud_id?: string | null
          gmud_titulo?: string | null
          id?: string
          status: string
          tipo_evento: string
          usuario_email?: string | null
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          detalhes?: Json | null
          gmud_id?: string | null
          gmud_titulo?: string | null
          id?: string
          status?: string
          tipo_evento?: string
          usuario_email?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmud_logs_gmud_id_fkey"
            columns: ["gmud_id"]
            isOneToOne: false
            referencedRelation: "gmuds"
            referencedColumns: ["id"]
          },
        ]
      }
      gmuds: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_email: string | null
          criado_por_nome: string | null
          data_fim: string | null
          data_inicio: string | null
          department_id: string | null
          descricao: string | null
          id: string
          impacto: Database["public"]["Enums"]["gmud_impacto"]
          justificativa: string | null
          motivo_cancelamento: string | null
          plano_execucao: string | null
          plano_rollback: string | null
          status_geral: Database["public"]["Enums"]["gmud_status"]
          tipo: Database["public"]["Enums"]["gmud_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_email?: string | null
          criado_por_nome?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          department_id?: string | null
          descricao?: string | null
          id?: string
          impacto?: Database["public"]["Enums"]["gmud_impacto"]
          justificativa?: string | null
          motivo_cancelamento?: string | null
          plano_execucao?: string | null
          plano_rollback?: string | null
          status_geral?: Database["public"]["Enums"]["gmud_status"]
          tipo?: Database["public"]["Enums"]["gmud_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_email?: string | null
          criado_por_nome?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          department_id?: string | null
          descricao?: string | null
          id?: string
          impacto?: Database["public"]["Enums"]["gmud_impacto"]
          justificativa?: string | null
          motivo_cancelamento?: string | null
          plano_execucao?: string | null
          plano_rollback?: string | null
          status_geral?: Database["public"]["Enums"]["gmud_status"]
          tipo?: Database["public"]["Enums"]["gmud_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      gophish_cache: {
        Row: {
          data: Json
          error: string | null
          key: string
          synced_at: string
        }
        Insert: {
          data?: Json
          error?: string | null
          key: string
          synced_at?: string
        }
        Update: {
          data?: Json
          error?: string | null
          key?: string
          synced_at?: string
        }
        Relationships: []
      }
      ia_web_events: {
        Row: {
          app_name: string | null
          device_id: string | null
          domain: string | null
          duration_s: number | null
          endpoint_name: string | null
          event_at: string
          foreground_s: number | null
          id: string
          network_s: number | null
          process_name: string | null
          raw_event: string | null
          source: string
          source_event_id: string | null
          synced_at: string
          tenant_id: string
          user_name: string | null
        }
        Insert: {
          app_name?: string | null
          device_id?: string | null
          domain?: string | null
          duration_s?: number | null
          endpoint_name?: string | null
          event_at: string
          foreground_s?: number | null
          id: string
          network_s?: number | null
          process_name?: string | null
          raw_event?: string | null
          source?: string
          source_event_id?: string | null
          synced_at?: string
          tenant_id: string
          user_name?: string | null
        }
        Update: {
          app_name?: string | null
          device_id?: string | null
          domain?: string | null
          duration_s?: number | null
          endpoint_name?: string | null
          event_at?: string
          foreground_s?: number | null
          id?: string
          network_s?: number | null
          process_name?: string | null
          raw_event?: string | null
          source?: string
          source_event_id?: string | null
          synced_at?: string
          tenant_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string | null
          id: string
          ignored_count: number
          imported_count: number
          message: string | null
          module: string
          status: string
          total_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          ignored_count?: number
          imported_count?: number
          message?: string | null
          module: string
          status: string
          total_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          ignored_count?: number
          imported_count?: number
          message?: string | null
          module?: string
          status?: string
          total_count?: number
        }
        Relationships: []
      }
      indisponibilidades: {
        Row: {
          ativo_id: string
          created_at: string
          created_by: string | null
          duracao_min: number | null
          fim: string | null
          id: string
          inicio: string
          motivo: string | null
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo_id: string
          created_at?: string
          created_by?: string | null
          duracao_min?: number | null
          fim?: string | null
          id?: string
          inicio: string
          motivo?: string | null
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo_id?: string
          created_at?: string
          created_by?: string | null
          duracao_min?: number | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          observacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indisponibilidades_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "cmdb_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key: string | null
          base_url: string | null
          config: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      invite_redirects: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          target_url: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          target_url: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          target_url?: string
          used_at?: string | null
        }
        Relationships: []
      }
      maturidade: {
        Row: {
          delta_anterior: number | null
          delta_total: number | null
          id: string
          nota_iso: number | null
          nota_nist: number | null
          periodo: string
          periodo_ordem: number
          score: number | null
          segmento_id: string
          updated_at: string
        }
        Insert: {
          delta_anterior?: number | null
          delta_total?: number | null
          id?: string
          nota_iso?: number | null
          nota_nist?: number | null
          periodo: string
          periodo_ordem?: number
          score?: number | null
          segmento_id: string
          updated_at?: string
        }
        Update: {
          delta_anterior?: number | null
          delta_total?: number | null
          id?: string
          nota_iso?: number | null
          nota_nist?: number | null
          periodo?: string
          periodo_ordem?: number
          score?: number | null
          segmento_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maturidade_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
      }
      module_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          module_slug: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          module_slug: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          module_slug?: string
          user_id?: string
        }
        Relationships: []
      }
      module_permissions: {
        Row: {
          action: string
          description: string | null
          id: string
          label: string
          module_slug: string
          sort_order: number
        }
        Insert: {
          action: string
          description?: string | null
          id?: string
          label: string
          module_slug: string
          sort_order?: number
        }
        Update: {
          action?: string
          description?: string | null
          id?: string
          label?: string
          module_slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      nao_conformidade_chamados: {
        Row: {
          chamado: string
          created_at: string
          created_by: string | null
          data_abertura: string | null
          descricao: string | null
          id: string
          impacto: string | null
          responsavel: string | null
          updated_at: string
        }
        Insert: {
          chamado: string
          created_at?: string
          created_by?: string | null
          data_abertura?: string | null
          descricao?: string | null
          id?: string
          impacto?: string | null
          responsavel?: string | null
          updated_at?: string
        }
        Update: {
          chamado?: string
          created_at?: string
          created_by?: string | null
          data_abertura?: string | null
          descricao?: string | null
          id?: string
          impacto?: string | null
          responsavel?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nao_conformidades_manuais: {
        Row: {
          aceite_risco: string | null
          created_at: string
          created_by: string | null
          data_configuracao: string | null
          evidencias: string | null
          fora_compliance: string
          id: string
          impactos: string | null
          observacoes: string | null
          plataforma: string
          prazo_resolucao: string | null
          updated_at: string
        }
        Insert: {
          aceite_risco?: string | null
          created_at?: string
          created_by?: string | null
          data_configuracao?: string | null
          evidencias?: string | null
          fora_compliance: string
          id?: string
          impactos?: string | null
          observacoes?: string | null
          plataforma: string
          prazo_resolucao?: string | null
          updated_at?: string
        }
        Update: {
          aceite_risco?: string | null
          created_at?: string
          created_by?: string | null
          data_configuracao?: string | null
          evidencias?: string | null
          fora_compliance?: string
          id?: string
          impactos?: string | null
          observacoes?: string | null
          plataforma?: string
          prazo_resolucao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nps_clientes: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      nps_registros: {
        Row: {
          categoria: string
          cliente_id: string
          comentario: string | null
          created_at: string
          created_by: string | null
          data_pesquisa: string
          id: string
          nota: number
        }
        Insert: {
          categoria: string
          cliente_id: string
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          data_pesquisa: string
          id?: string
          nota: number
        }
        Update: {
          categoria?: string
          cliente_id?: string
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          data_pesquisa?: string
          id?: string
          nota?: number
        }
        Relationships: [
          {
            foreignKeyName: "nps_registros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "nps_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      org_areas: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          ordem: number
          responsavel_membro_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          responsavel_membro_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          responsavel_membro_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_areas_responsavel_fkey"
            columns: ["responsavel_membro_id"]
            isOneToOne: false
            referencedRelation: "org_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      org_funcoes_criticas: {
        Row: {
          area_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          substituto_id: string | null
          titular_id: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          substituto_id?: string | null
          titular_id?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          substituto_id?: string | null
          titular_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_funcoes_criticas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "org_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_funcoes_criticas_substituto_id_fkey"
            columns: ["substituto_id"]
            isOneToOne: false
            referencedRelation: "org_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_funcoes_criticas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "org_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      org_membros: {
        Row: {
          area_id: string
          ativo: boolean
          cargo: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          nome: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          area_id: string
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          area_id?: string
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_membros_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "org_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_treinamento_participantes: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          created_at: string
          membro_id: string
          treinamento_id: string
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          created_at?: string
          membro_id: string
          treinamento_id: string
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          created_at?: string
          membro_id?: string
          treinamento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_treinamento_participantes_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "org_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_treinamento_participantes_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "org_treinamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      org_treinamentos: {
        Row: {
          area_id: string | null
          created_at: string
          created_by: string | null
          fim: string | null
          id: string
          inicio: string | null
          observacao: string | null
          provedor: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          observacao?: string | null
          provedor?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          observacao?: string | null
          provedor?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_treinamentos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "org_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacao_config: {
        Row: {
          dominio_corporativo: string | null
          id: boolean
          nome: string
          nome_curto: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dominio_corporativo?: string | null
          id?: boolean
          nome: string
          nome_curto?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dominio_corporativo?: string | null
          id?: boolean
          nome?: string
          nome_curto?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      permission_profile_items: {
        Row: {
          action: string
          id: string
          module_slug: string
          profile_id: string
        }
        Insert: {
          action: string
          id?: string
          module_slug: string
          profile_id: string
        }
        Update: {
          action?: string
          id?: string
          module_slug?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_profile_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      pilulas_si: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          id: string
          link: string | null
          nome: string
          quantidade: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string | null
          id?: string
          link?: string | null
          nome: string
          quantidade?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          id?: string
          link?: string | null
          nome?: string
          quantidade?: number
          updated_at?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          indicador: string | null
          name: string
          onda: string | null
          publicacao: string | null
          revisao: string | null
          status: Database["public"]["Enums"]["policy_status"]
          target_count: number
          tipo: string | null
          trained_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          indicador?: string | null
          name: string
          onda?: string | null
          publicacao?: string | null
          revisao?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          target_count?: number
          tipo?: string | null
          trained_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          indicador?: string | null
          name?: string
          onda?: string | null
          publicacao?: string | null
          revisao?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          target_count?: number
          tipo?: string | null
          trained_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      privacy_consentimentos_daily: {
        Row: {
          concedidos: number
          created_at: string
          date: string
          grupo: string
          hipotese_tratamento: string
          id: string
          recusados: number
          synced_at: string
          titulares_concedidos: number
          titulares_mistos: number
          titulares_recusados: number
          titulares_total: number
          total: number
        }
        Insert: {
          concedidos?: number
          created_at?: string
          date: string
          grupo?: string
          hipotese_tratamento?: string
          id?: string
          recusados?: number
          synced_at?: string
          titulares_concedidos?: number
          titulares_mistos?: number
          titulares_recusados?: number
          titulares_total?: number
          total?: number
        }
        Update: {
          concedidos?: number
          created_at?: string
          date?: string
          grupo?: string
          hipotese_tratamento?: string
          id?: string
          recusados?: number
          synced_at?: string
          titulares_concedidos?: number
          titulares_mistos?: number
          titulares_recusados?: number
          titulares_total?: number
          total?: number
        }
        Relationships: []
      }
      privacy_cookies_daily: {
        Row: {
          concedidos: number
          created_at: string
          date: string
          id: string
          recusados: number
          synced_at: string
          total: number
        }
        Insert: {
          concedidos?: number
          created_at?: string
          date: string
          id?: string
          recusados?: number
          synced_at?: string
          total?: number
        }
        Update: {
          concedidos?: number
          created_at?: string
          date?: string
          id?: string
          recusados?: number
          synced_at?: string
          total?: number
        }
        Relationships: []
      }
      privacy_uso_mensal: {
        Row: {
          ano: number
          created_at: string
          id: string
          mes: number
          num_empresas: number
          num_sites: number
          num_titulares: number
          page_views: number
          synced_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          mes: number
          num_empresas?: number
          num_sites?: number
          num_titulares?: number
          page_views?: number
          synced_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          mes?: number
          num_empresas?: number
          num_sites?: number
          num_titulares?: number
          page_views?: number
          synced_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_method: string
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          permission_profile_id: string | null
          session_started_at: string | null
        }
        Insert: {
          auth_method?: string
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_active_at?: string | null
          permission_profile_id?: string | null
          session_started_at?: string | null
        }
        Update: {
          auth_method?: string
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          permission_profile_id?: string | null
          session_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_permission_profile_id_fkey"
            columns: ["permission_profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qradar_drop_alerts: {
        Row: {
          dropped_count: number | null
          id: string
          log_source_id: number | null
          log_source_name: string | null
          occurred_at: string
          raw: Json | null
          reason: string | null
          synced_at: string
        }
        Insert: {
          dropped_count?: number | null
          id: string
          log_source_id?: number | null
          log_source_name?: string | null
          occurred_at: string
          raw?: Json | null
          reason?: string | null
          synced_at?: string
        }
        Update: {
          dropped_count?: number | null
          id?: string
          log_source_id?: number | null
          log_source_name?: string | null
          occurred_at?: string
          raw?: Json | null
          reason?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      qradar_eps_samples: {
        Row: {
          id: string
          licensed_eps: number
          peak_eps: number | null
          peak_eps_avg: number | null
          raw: Json | null
          sampled_at: string
          total_eps: number
        }
        Insert: {
          id?: string
          licensed_eps?: number
          peak_eps?: number | null
          peak_eps_avg?: number | null
          raw?: Json | null
          sampled_at?: string
          total_eps: number
        }
        Update: {
          id?: string
          licensed_eps?: number
          peak_eps?: number | null
          peak_eps_avg?: number | null
          raw?: Json | null
          sampled_at?: string
          total_eps?: number
        }
        Relationships: []
      }
      qradar_external_offenders: {
        Row: {
          event_count: number | null
          id: string
          sampled_at: string
          source_ip: string
        }
        Insert: {
          event_count?: number | null
          id?: string
          sampled_at: string
          source_ip: string
        }
        Update: {
          event_count?: number | null
          id?: string
          sampled_at?: string
          source_ip?: string
        }
        Relationships: []
      }
      qradar_fortigate_policy_changes: {
        Row: {
          action: string | null
          destination_ip: string | null
          event_category: string | null
          event_name: string | null
          event_time: string
          id: string
          log_source_name: string | null
          message: string | null
          qid: number | null
          qid_name: string | null
          query_type: string
          raw: Json | null
          source_ip: string | null
          synced_at: string
          username: string | null
        }
        Insert: {
          action?: string | null
          destination_ip?: string | null
          event_category?: string | null
          event_name?: string | null
          event_time: string
          id: string
          log_source_name?: string | null
          message?: string | null
          qid?: number | null
          qid_name?: string | null
          query_type?: string
          raw?: Json | null
          source_ip?: string | null
          synced_at?: string
          username?: string | null
        }
        Update: {
          action?: string | null
          destination_ip?: string | null
          event_category?: string | null
          event_name?: string | null
          event_time?: string
          id?: string
          log_source_name?: string | null
          message?: string | null
          qid?: number | null
          qid_name?: string | null
          query_type?: string
          raw?: Json | null
          source_ip?: string | null
          synced_at?: string
          username?: string | null
        }
        Relationships: []
      }
      qradar_internal_offenders: {
        Row: {
          event_count: number | null
          id: string
          sampled_at: string
          source_ip: string
        }
        Insert: {
          event_count?: number | null
          id?: string
          sampled_at: string
          source_ip: string
        }
        Update: {
          event_count?: number | null
          id?: string
          sampled_at?: string
          source_ip?: string
        }
        Relationships: []
      }
      qradar_log_sources: {
        Row: {
          avg_eps: number | null
          enabled: boolean | null
          id: number
          last_event_time: string | null
          name: string
          peak_eps: number | null
          raw: Json | null
          status: string
          status_changed_at: string | null
          synced_at: string
          type_name: string | null
        }
        Insert: {
          avg_eps?: number | null
          enabled?: boolean | null
          id: number
          last_event_time?: string | null
          name: string
          peak_eps?: number | null
          raw?: Json | null
          status?: string
          status_changed_at?: string | null
          synced_at?: string
          type_name?: string | null
        }
        Update: {
          avg_eps?: number | null
          enabled?: boolean | null
          id?: number
          last_event_time?: string | null
          name?: string
          peak_eps?: number | null
          raw?: Json | null
          status?: string
          status_changed_at?: string | null
          synced_at?: string
          type_name?: string | null
        }
        Relationships: []
      }
      qradar_o365_deletions: {
        Row: {
          event_count: number | null
          event_time: string | null
          id: string
          qid: number | null
          sampled_at: string
          source_ip: string | null
          username: string
        }
        Insert: {
          event_count?: number | null
          event_time?: string | null
          id?: string
          qid?: number | null
          sampled_at: string
          source_ip?: string | null
          username: string
        }
        Update: {
          event_count?: number | null
          event_time?: string | null
          id?: string
          qid?: number | null
          sampled_at?: string
          source_ip?: string | null
          username?: string
        }
        Relationships: []
      }
      qradar_o365_downloads: {
        Row: {
          event_count: number | null
          event_time: string | null
          id: string
          qid: number | null
          sampled_at: string
          source_ip: string | null
          username: string
        }
        Insert: {
          event_count?: number | null
          event_time?: string | null
          id?: string
          qid?: number | null
          sampled_at: string
          source_ip?: string | null
          username: string
        }
        Update: {
          event_count?: number | null
          event_time?: string | null
          id?: string
          qid?: number | null
          sampled_at?: string
          source_ip?: string | null
          username?: string
        }
        Relationships: []
      }
      qradar_offenses: {
        Row: {
          closed_at: string | null
          description: string | null
          destination_ip: string | null
          event_count: number | null
          id: number
          last_updated_time: string | null
          magnitude: number | null
          raw: Json | null
          severity: number | null
          source_ip: string | null
          start_time: string | null
          status: string | null
          synced_at: string
          username: string | null
        }
        Insert: {
          closed_at?: string | null
          description?: string | null
          destination_ip?: string | null
          event_count?: number | null
          id: number
          last_updated_time?: string | null
          magnitude?: number | null
          raw?: Json | null
          severity?: number | null
          source_ip?: string | null
          start_time?: string | null
          status?: string | null
          synced_at?: string
          username?: string | null
        }
        Update: {
          closed_at?: string | null
          description?: string | null
          destination_ip?: string | null
          event_count?: number | null
          id?: number
          last_updated_time?: string | null
          magnitude?: number | null
          raw?: Json | null
          severity?: number | null
          source_ip?: string | null
          start_time?: string | null
          status?: string | null
          synced_at?: string
          username?: string | null
        }
        Relationships: []
      }
      qradar_rdp_events: {
        Row: {
          destination_ip: string | null
          event_time: string
          id: string
          log_source: string | null
          raw: Json | null
          source_ip: string | null
          synced_at: string
          username: string | null
        }
        Insert: {
          destination_ip?: string | null
          event_time: string
          id: string
          log_source?: string | null
          raw?: Json | null
          source_ip?: string | null
          synced_at?: string
          username?: string | null
        }
        Update: {
          destination_ip?: string | null
          event_time?: string
          id?: string
          log_source?: string | null
          raw?: Json | null
          source_ip?: string | null
          synced_at?: string
          username?: string | null
        }
        Relationships: []
      }
      qradar_sync_state: {
        Row: {
          id: boolean
          last_eps_sample_at: string | null
          last_error: string | null
          last_events_sync: string | null
          last_full_sync_at: string | null
          last_log_sources_sync: string | null
          last_offenses_sync: string | null
          sync_running_since: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          last_eps_sample_at?: string | null
          last_error?: string | null
          last_events_sync?: string | null
          last_full_sync_at?: string | null
          last_log_sources_sync?: string | null
          last_offenses_sync?: string | null
          sync_running_since?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          last_eps_sample_at?: string | null
          last_error?: string | null
          last_events_sync?: string | null
          last_full_sync_at?: string | null
          last_log_sources_sync?: string | null
          last_offenses_sync?: string | null
          sync_running_since?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sast_finding_events: {
        Row: {
          author: string | null
          author_email: string | null
          build_id: string | null
          build_url: string | null
          commit_sha: string | null
          created_at: string
          detected_at: string
          file_url: string | null
          finding_id: string
          id: string
          ingest_source: string
          raw_event: Json | null
          source_event_id: string
        }
        Insert: {
          author?: string | null
          author_email?: string | null
          build_id?: string | null
          build_url?: string | null
          commit_sha?: string | null
          created_at?: string
          detected_at: string
          file_url?: string | null
          finding_id: string
          id?: string
          ingest_source: string
          raw_event?: Json | null
          source_event_id: string
        }
        Update: {
          author?: string | null
          author_email?: string | null
          build_id?: string | null
          build_url?: string | null
          commit_sha?: string | null
          created_at?: string
          detected_at?: string
          file_url?: string | null
          finding_id?: string
          id?: string
          ingest_source?: string
          raw_event?: Json | null
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sast_finding_events_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "sast_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      sast_findings: {
        Row: {
          branch: string
          category: string
          created_at: string
          details: Json
          environment: string
          file_path: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          introduced_by: string | null
          introduced_by_email: string | null
          last_author: string | null
          last_author_email: string | null
          last_build_id: string | null
          last_build_url: string | null
          last_commit_sha: string | null
          last_file_url: string | null
          last_seen_at: string
          line: number | null
          occurrences: number
          project: string
          repository: string
          resolution_source: string | null
          resolved_at: string | null
          rule_id: string
          severity: string | null
          status: string
          title: string | null
          tool: string
          triage_note: string | null
          triaged_at: string | null
          triaged_by: string | null
          updated_at: string
        }
        Insert: {
          branch: string
          category: string
          created_at?: string
          details?: Json
          environment: string
          file_path?: string | null
          fingerprint: string
          first_seen_at: string
          id?: string
          introduced_by?: string | null
          introduced_by_email?: string | null
          last_author?: string | null
          last_author_email?: string | null
          last_build_id?: string | null
          last_build_url?: string | null
          last_commit_sha?: string | null
          last_file_url?: string | null
          last_seen_at: string
          line?: number | null
          occurrences?: number
          project: string
          repository: string
          resolution_source?: string | null
          resolved_at?: string | null
          rule_id: string
          severity?: string | null
          status?: string
          title?: string | null
          tool: string
          triage_note?: string | null
          triaged_at?: string | null
          triaged_by?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          category?: string
          created_at?: string
          details?: Json
          environment?: string
          file_path?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          introduced_by?: string | null
          introduced_by_email?: string | null
          last_author?: string | null
          last_author_email?: string | null
          last_build_id?: string | null
          last_build_url?: string | null
          last_commit_sha?: string | null
          last_file_url?: string | null
          last_seen_at?: string
          line?: number | null
          occurrences?: number
          project?: string
          repository?: string
          resolution_source?: string | null
          resolved_at?: string | null
          rule_id?: string
          severity?: string | null
          status?: string
          title?: string | null
          tool?: string
          triage_note?: string | null
          triaged_at?: string | null
          triaged_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sast_ingest_cursor: {
        Row: {
          last_event_at: string
          source: string
          updated_at: string
        }
        Insert: {
          last_event_at: string
          source: string
          updated_at?: string
        }
        Update: {
          last_event_at?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      sast_scan_runs: {
        Row: {
          branch: string
          build_id: string | null
          build_url: string | null
          commit_sha: string | null
          created_at: string
          environment: string
          findings_count: number | null
          id: string
          ingest_source: string
          project: string
          repository: string
          scanned_at: string
          source_event_id: string
          tool: string
        }
        Insert: {
          branch: string
          build_id?: string | null
          build_url?: string | null
          commit_sha?: string | null
          created_at?: string
          environment: string
          findings_count?: number | null
          id?: string
          ingest_source: string
          project: string
          repository: string
          scanned_at: string
          source_event_id: string
          tool: string
        }
        Update: {
          branch?: string
          build_id?: string | null
          build_url?: string | null
          commit_sha?: string | null
          created_at?: string
          environment?: string
          findings_count?: number | null
          id?: string
          ingest_source?: string
          project?: string
          repository?: string
          scanned_at?: string
          source_event_id?: string
          tool?: string
        }
        Relationships: []
      }
      segmentos: {
        Row: {
          created_at: string
          id: string
          is_propria: boolean
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_propria?: boolean
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_propria?: boolean
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      segmentos_notas: {
        Row: {
          created_at: string
          id: string
          nota_iso: number | null
          nota_nist: number | null
          periodo: string
          periodo_ordem: number
          segmento_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nota_iso?: number | null
          nota_nist?: number | null
          periodo: string
          periodo_ordem?: number
          segmento_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nota_iso?: number | null
          nota_nist?: number | null
          periodo?: string
          periodo_ordem?: number
          segmento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmentos_notas_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
      }
      sek_tickets: {
        Row: {
          assignee_id: number | null
          can_be_solved_by_me: boolean | null
          can_comment: boolean | null
          custom_status_id: number | null
          description: string | null
          id: number
          ofensa_numero: string | null
          parsed_alert: Json | null
          priority: string | null
          raw_payload: Json
          requester_id: number | null
          status: string
          subject: string
          synced_at: string
          type: string | null
          zendesk_created_at: string | null
          zendesk_updated_at: string | null
        }
        Insert: {
          assignee_id?: number | null
          can_be_solved_by_me?: boolean | null
          can_comment?: boolean | null
          custom_status_id?: number | null
          description?: string | null
          id: number
          ofensa_numero?: string | null
          parsed_alert?: Json | null
          priority?: string | null
          raw_payload: Json
          requester_id?: number | null
          status: string
          subject: string
          synced_at?: string
          type?: string | null
          zendesk_created_at?: string | null
          zendesk_updated_at?: string | null
        }
        Update: {
          assignee_id?: number | null
          can_be_solved_by_me?: boolean | null
          can_comment?: boolean | null
          custom_status_id?: number | null
          description?: string | null
          id?: number
          ofensa_numero?: string | null
          parsed_alert?: Json | null
          priority?: string | null
          raw_payload?: Json
          requester_id?: number | null
          status?: string
          subject?: string
          synced_at?: string
          type?: string | null
          zendesk_created_at?: string | null
          zendesk_updated_at?: string | null
        }
        Relationships: []
      }
      sek_zendesk_auth_log: {
        Row: {
          created_at: string
          event: string
          id: string
          reported_at: string | null
          triggered_by: string | null
          triggered_by_name: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          reported_at?: string | null
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          reported_at?: string | null
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Relationships: []
      }
      shadowit_findings: {
        Row: {
          classification: string | null
          first_seen_at: string
          found_at: string
          id: string
          ip: string
          ip_norm: string | null
          kind: string
          kind_norm: string | null
          name: string
          name_norm: string | null
          occurrence_count: number
          permission: string | null
          raw_output: Json | null
          reopened_at: string | null
          scan_id: string | null
          status: string
          value: string | null
        }
        Insert: {
          classification?: string | null
          first_seen_at?: string
          found_at?: string
          id?: string
          ip: string
          ip_norm?: string | null
          kind: string
          kind_norm?: string | null
          name: string
          name_norm?: string | null
          occurrence_count?: number
          permission?: string | null
          raw_output?: Json | null
          reopened_at?: string | null
          scan_id?: string | null
          status?: string
          value?: string | null
        }
        Update: {
          classification?: string | null
          first_seen_at?: string
          found_at?: string
          id?: string
          ip?: string
          ip_norm?: string | null
          kind?: string
          kind_norm?: string | null
          name?: string
          name_norm?: string | null
          occurrence_count?: number
          permission?: string | null
          raw_output?: Json | null
          reopened_at?: string | null
          scan_id?: string | null
          status?: string
          value?: string | null
        }
        Relationships: []
      }
      shadowit_hosts: {
        Row: {
          first_seen_at: string
          hostname: string | null
          id: string
          ip: string
          ip_norm: string | null
          last_seen_at: string
          mac: string | null
          scan_id: string | null
          source: string
        }
        Insert: {
          first_seen_at?: string
          hostname?: string | null
          id?: string
          ip: string
          ip_norm?: string | null
          last_seen_at?: string
          mac?: string | null
          scan_id?: string | null
          source?: string
        }
        Update: {
          first_seen_at?: string
          hostname?: string | null
          id?: string
          ip?: string
          ip_norm?: string | null
          last_seen_at?: string
          mac?: string | null
          scan_id?: string | null
          source?: string
        }
        Relationships: []
      }
      shadowit_scans: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          name: string | null
          progress: number
          started_at: string | null
          started_by: string | null
          status: string
          targets: string[]
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          name?: string | null
          progress?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          targets?: string[]
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          name?: string | null
          progress?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          targets?: string[]
        }
        Relationships: []
      }
      smtp_config: {
        Row: {
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          host: string | null
          id: string
          password: string | null
          port: number | null
          secure: boolean | null
          updated_at: string
          updated_by: string | null
          username: string | null
        }
        Insert: {
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          id?: string
          password?: string | null
          port?: number | null
          secure?: boolean | null
          updated_at?: string
          updated_by?: string | null
          username?: string | null
        }
        Update: {
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          id?: string
          password?: string | null
          port?: number | null
          secure?: boolean | null
          updated_at?: string
          updated_by?: string | null
          username?: string | null
        }
        Relationships: []
      }
      sophos_alerts: {
        Row: {
          category: string | null
          description: string | null
          id: string
          managed_agent_name: string | null
          person_name: string | null
          product: string | null
          raised_at: string | null
          raw: Json | null
          severity: string | null
          synced_at: string
          tenant_id: string
          type: string | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          id: string
          managed_agent_name?: string | null
          person_name?: string | null
          product?: string | null
          raised_at?: string | null
          raw?: Json | null
          severity?: string | null
          synced_at?: string
          tenant_id: string
          type?: string | null
        }
        Update: {
          category?: string | null
          description?: string | null
          id?: string
          managed_agent_name?: string | null
          person_name?: string | null
          product?: string | null
          raised_at?: string | null
          raw?: Json | null
          severity?: string | null
          synced_at?: string
          tenant_id?: string
          type?: string | null
        }
        Relationships: []
      }
      sophos_audit_events: {
        Row: {
          description: string | null
          id: string
          item_modified: string | null
          item_type: string | null
          modified_by: string | null
          modifier_account_id: string | null
          modifier_account_type: string | null
          modifier_type: string | null
          occurred_at: string | null
          origin_ip_address: string | null
          raw: Json | null
          resource_owner_id: string | null
          resource_owner_type: string | null
          synced_at: string
          tenant_id: string
        }
        Insert: {
          description?: string | null
          id: string
          item_modified?: string | null
          item_type?: string | null
          modified_by?: string | null
          modifier_account_id?: string | null
          modifier_account_type?: string | null
          modifier_type?: string | null
          occurred_at?: string | null
          origin_ip_address?: string | null
          raw?: Json | null
          resource_owner_id?: string | null
          resource_owner_type?: string | null
          synced_at?: string
          tenant_id: string
        }
        Update: {
          description?: string | null
          id?: string
          item_modified?: string | null
          item_type?: string | null
          modified_by?: string | null
          modifier_account_id?: string | null
          modifier_account_type?: string | null
          modifier_type?: string | null
          occurred_at?: string | null
          origin_ip_address?: string | null
          raw?: Json | null
          resource_owner_id?: string | null
          resource_owner_type?: string | null
          synced_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      sophos_endpoints: {
        Row: {
          encrypted: boolean | null
          health_overall: string | null
          hostname: string | null
          id: string
          last_seen_at: string | null
          online: boolean | null
          os_platform: string | null
          raw: Json | null
          synced_at: string
          tenant_id: string
          type: string | null
        }
        Insert: {
          encrypted?: boolean | null
          health_overall?: string | null
          hostname?: string | null
          id: string
          last_seen_at?: string | null
          online?: boolean | null
          os_platform?: string | null
          raw?: Json | null
          synced_at?: string
          tenant_id: string
          type?: string | null
        }
        Update: {
          encrypted?: boolean | null
          health_overall?: string | null
          hostname?: string | null
          id?: string
          last_seen_at?: string | null
          online?: boolean | null
          os_platform?: string | null
          raw?: Json | null
          synced_at?: string
          tenant_id?: string
          type?: string | null
        }
        Relationships: []
      }
      sophos_events: {
        Row: {
          detection_category: string | null
          endpoint_id: string | null
          endpoint_name: string | null
          event_at: string | null
          id: string
          name: string | null
          raw: Json | null
          severity: string | null
          source: string | null
          synced_at: string
          tenant_id: string
          type: string | null
          user_name: string | null
          user_normalized: string | null
        }
        Insert: {
          detection_category?: string | null
          endpoint_id?: string | null
          endpoint_name?: string | null
          event_at?: string | null
          id: string
          name?: string | null
          raw?: Json | null
          severity?: string | null
          source?: string | null
          synced_at?: string
          tenant_id: string
          type?: string | null
          user_name?: string | null
          user_normalized?: string | null
        }
        Update: {
          detection_category?: string | null
          endpoint_id?: string | null
          endpoint_name?: string | null
          event_at?: string | null
          id?: string
          name?: string | null
          raw?: Json | null
          severity?: string | null
          source?: string | null
          synced_at?: string
          tenant_id?: string
          type?: string | null
          user_name?: string | null
          user_normalized?: string | null
        }
        Relationships: []
      }
      sophos_excecoes: {
        Row: {
          created_at: string
          created_by: string | null
          event_name: string
          id: string
          match_type: string
          target: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_name: string
          id?: string
          match_type?: string
          target?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_name?: string
          id?: string
          match_type?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
      sophos_licenses: {
        Row: {
          end_date: string | null
          id: string
          license_identifier: string | null
          license_type: string | null
          perpetual: boolean | null
          product_code: string | null
          product_generic_code: string | null
          product_name: string | null
          quantity: number | null
          raw: Json | null
          start_date: string | null
          synced_at: string
          tenant_id: string
          unlimited: boolean | null
          usage_count: number | null
          usage_date: string | null
        }
        Insert: {
          end_date?: string | null
          id: string
          license_identifier?: string | null
          license_type?: string | null
          perpetual?: boolean | null
          product_code?: string | null
          product_generic_code?: string | null
          product_name?: string | null
          quantity?: number | null
          raw?: Json | null
          start_date?: string | null
          synced_at?: string
          tenant_id: string
          unlimited?: boolean | null
          usage_count?: number | null
          usage_date?: string | null
        }
        Update: {
          end_date?: string | null
          id?: string
          license_identifier?: string | null
          license_type?: string | null
          perpetual?: boolean | null
          product_code?: string | null
          product_generic_code?: string | null
          product_name?: string | null
          quantity?: number | null
          raw?: Json | null
          start_date?: string | null
          synced_at?: string
          tenant_id?: string
          unlimited?: boolean | null
          usage_count?: number | null
          usage_date?: string | null
        }
        Relationships: []
      }
      sophos_policies: {
        Row: {
          assigned_count: number
          id: string
          name: string | null
          policy_type: string | null
          raw: Json | null
          synced_at: string
          tenant_id: string
        }
        Insert: {
          assigned_count?: number
          id: string
          name?: string | null
          policy_type?: string | null
          raw?: Json | null
          synced_at?: string
          tenant_id: string
        }
        Update: {
          assigned_count?: number
          id?: string
          name?: string | null
          policy_type?: string | null
          raw?: Json | null
          synced_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      sophos_sync_state: {
        Row: {
          last_alerts_cursor: string | null
          last_alerts_raised_at: string | null
          last_audit_synced_at: string | null
          last_endpoints_synced_at: string | null
          last_events_at: string | null
          last_events_cursor: string | null
          last_full_sync_at: string | null
          last_policies_synced_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          last_alerts_cursor?: string | null
          last_alerts_raised_at?: string | null
          last_audit_synced_at?: string | null
          last_endpoints_synced_at?: string | null
          last_events_at?: string | null
          last_events_cursor?: string | null
          last_full_sync_at?: string | null
          last_policies_synced_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          last_alerts_cursor?: string | null
          last_alerts_raised_at?: string | null
          last_audit_synced_at?: string | null
          last_endpoints_synced_at?: string | null
          last_events_at?: string | null
          last_events_cursor?: string | null
          last_full_sync_at?: string | null
          last_policies_synced_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ssl_certificate_bindings: {
        Row: {
          certificate_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          url: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          url: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssl_certificate_bindings_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "ssl_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      ssl_certificate_history: {
        Row: {
          certificate_id: string
          fingerprint_sha256: string | null
          id: string
          issuer: string | null
          replaced_at: string
          replaced_by: string | null
          serial_number: string | null
          subject_alt_names: string[] | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          certificate_id: string
          fingerprint_sha256?: string | null
          id?: string
          issuer?: string | null
          replaced_at?: string
          replaced_by?: string | null
          serial_number?: string | null
          subject_alt_names?: string[] | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          certificate_id?: string
          fingerprint_sha256?: string | null
          id?: string
          issuer?: string | null
          replaced_at?: string
          replaced_by?: string | null
          serial_number?: string | null
          subject_alt_names?: string[] | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ssl_certificate_history_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "ssl_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      ssl_certificates: {
        Row: {
          alert_days: number
          created_at: string
          created_by: string | null
          domain_name: string
          fingerprint_sha256: string | null
          id: string
          issuer: string
          last_alert_sent_at: string | null
          last_check_error: string | null
          last_checked_at: string | null
          notes: string | null
          serial_number: string | null
          source: string | null
          status: string
          subject_alt_names: string[] | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          alert_days?: number
          created_at?: string
          created_by?: string | null
          domain_name: string
          fingerprint_sha256?: string | null
          id?: string
          issuer?: string
          last_alert_sent_at?: string | null
          last_check_error?: string | null
          last_checked_at?: string | null
          notes?: string | null
          serial_number?: string | null
          source?: string | null
          status?: string
          subject_alt_names?: string[] | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          alert_days?: number
          created_at?: string
          created_by?: string | null
          domain_name?: string
          fingerprint_sha256?: string | null
          id?: string
          issuer?: string
          last_alert_sent_at?: string | null
          last_check_error?: string | null
          last_checked_at?: string | null
          notes?: string | null
          serial_number?: string | null
          source?: string | null
          status?: string
          subject_alt_names?: string[] | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      sso_config: {
        Row: {
          allowed_domains: string[]
          azure_client_id: string | null
          azure_tenant_id: string | null
          created_at: string
          id: string
          ldap_base_dn: string | null
          ldap_bind_dn: string | null
          ldap_enabled: boolean
          ldap_host: string | null
          ldap_port: number | null
          oauth_enabled: boolean
          provider_mode: string
          saml_enabled: boolean
          saml_metadata_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_domains?: string[]
          azure_client_id?: string | null
          azure_tenant_id?: string | null
          created_at?: string
          id?: string
          ldap_base_dn?: string | null
          ldap_bind_dn?: string | null
          ldap_enabled?: boolean
          ldap_host?: string | null
          ldap_port?: number | null
          oauth_enabled?: boolean
          provider_mode?: string
          saml_enabled?: boolean
          saml_metadata_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_domains?: string[]
          azure_client_id?: string | null
          azure_tenant_id?: string | null
          created_at?: string
          id?: string
          ldap_base_dn?: string | null
          ldap_bind_dn?: string | null
          ldap_enabled?: boolean
          ldap_host?: string | null
          ldap_port?: number | null
          oauth_enabled?: boolean
          provider_mode?: string
          saml_enabled?: boolean
          saml_metadata_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      system_audit_log: {
        Row: {
          acao: string
          created_at: string
          descricao: string
          detalhes: Json | null
          id: string
          mensagem_erro: string | null
          modulo: string
          status: string
          user_id: string | null
          usuario_email: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          descricao: string
          detalhes?: Json | null
          id?: string
          mensagem_erro?: string | null
          modulo: string
          status?: string
          user_id?: string | null
          usuario_email?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          descricao?: string
          detalhes?: Json | null
          id?: string
          mensagem_erro?: string | null
          modulo?: string
          status?: string
          user_id?: string | null
          usuario_email?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      treinamento_acessos: {
        Row: {
          colaborador_id: string | null
          created_at: string
          detalhe: string | null
          email: string | null
          evento: string
          id: string
          ip: string | null
          treinamento_id: string | null
          user_agent: string | null
        }
        Insert: {
          colaborador_id?: string | null
          created_at?: string
          detalhe?: string | null
          email?: string | null
          evento: string
          id?: string
          ip?: string | null
          treinamento_id?: string | null
          user_agent?: string | null
        }
        Update: {
          colaborador_id?: string | null
          created_at?: string
          detalhe?: string | null
          email?: string | null
          evento?: string
          id?: string
          ip?: string | null
          treinamento_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treinamento_acessos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treinamento_acessos_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "treinamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      treinamento_atribuicoes: {
        Row: {
          colaborador_id: string
          concluido_em: string | null
          convite_enviado_em: string | null
          created_at: string
          created_by: string | null
          id: string
          iniciado_em: string | null
          origem: string
          origem_ref: string | null
          pct_assistido: number
          prazo: string | null
          status: string
          treinamento_id: string
          ultimo_lembrete_em: string | null
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          concluido_em?: string | null
          convite_enviado_em?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          iniciado_em?: string | null
          origem?: string
          origem_ref?: string | null
          pct_assistido?: number
          prazo?: string | null
          status?: string
          treinamento_id: string
          ultimo_lembrete_em?: string | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          concluido_em?: string | null
          convite_enviado_em?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          iniciado_em?: string | null
          origem?: string
          origem_ref?: string | null
          pct_assistido?: number
          prazo?: string | null
          status?: string
          treinamento_id?: string
          ultimo_lembrete_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treinamento_atribuicoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treinamento_atribuicoes_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "treinamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      treinamentos: {
        Row: {
          bloquear_avanco: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          duracao_seg: number | null
          exigir_ciencia: boolean
          exigir_pct_assistido: number
          id: string
          policy_id: string | null
          prazo_padrao_dias: number
          status: string
          tipo: string
          titulo: string
          updated_at: string
          video_path: string | null
          video_url: string | null
        }
        Insert: {
          bloquear_avanco?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          duracao_seg?: number | null
          exigir_ciencia?: boolean
          exigir_pct_assistido?: number
          id?: string
          policy_id?: string | null
          prazo_padrao_dias?: number
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
        }
        Update: {
          bloquear_avanco?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          duracao_seg?: number | null
          exigir_ciencia?: boolean
          exigir_pct_assistido?: number
          id?: string
          policy_id?: string | null
          prazo_padrao_dias?: number
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treinamentos_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dashboard_layouts: {
        Row: {
          layout: Json
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          layout: Json
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          layout?: Json
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_module_filter_defaults: {
        Row: {
          custom_from: string | null
          custom_to: string | null
          module: string
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          custom_from?: string | null
          custom_to?: string | null
          module: string
          period: string
          updated_at?: string
          user_id: string
        }
        Update: {
          custom_from?: string | null
          custom_to?: string | null
          module?: string
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          action: string
          granted_at: string
          granted_by: string | null
          id: string
          module_slug: string
          user_id: string
        }
        Insert: {
          action: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          module_slug: string
          user_id: string
        }
        Update: {
          action?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          module_slug?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vuln_infra_monthly_snapshot: {
        Row: {
          created_at: string
          fix_count: number
          maintained_count: number
          month: string
          new_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fix_count?: number
          maintained_count?: number
          month: string
          new_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fix_count?: number
          maintained_count?: number
          month?: string
          new_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      vuln_logs: {
        Row: {
          created_at: string
          descricao: string
          detalhes: Json | null
          fqdn: string | null
          id: string
          status: string
          tipo_evento: string
          usuario_email: string | null
          usuario_nome: string | null
          vuln_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          detalhes?: Json | null
          fqdn?: string | null
          id?: string
          status: string
          tipo_evento: string
          usuario_email?: string | null
          usuario_nome?: string | null
          vuln_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          detalhes?: Json | null
          fqdn?: string | null
          id?: string
          status?: string
          tipo_evento?: string
          usuario_email?: string | null
          usuario_nome?: string | null
          vuln_id?: string | null
        }
        Relationships: []
      }
      vuln_snapshots: {
        Row: {
          abertas: number
          altas: number
          baixas: number
          created_at: string
          criticas: number
          estimated: boolean
          id: string
          medias: number
          resolvidas: number
          snapshot_date: string
          total: number
          updated_at: string
        }
        Insert: {
          abertas?: number
          altas?: number
          baixas?: number
          created_at?: string
          criticas?: number
          estimated?: boolean
          id?: string
          medias?: number
          resolvidas?: number
          snapshot_date: string
          total?: number
          updated_at?: string
        }
        Update: {
          abertas?: number
          altas?: number
          baixas?: number
          created_at?: string
          criticas?: number
          estimated?: boolean
          id?: string
          medias?: number
          resolvidas?: number
          snapshot_date?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      vulnerabilities_aplicacao: {
        Row: {
          closed_at: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          external_id: string | null
          fqdn: string
          id: string
          identified_at: string | null
          kind: string
          mitigation_description: string | null
          pending_approval: boolean | null
          pending_at: string | null
          pending_by: string | null
          pending_status: string | null
          raw: Json | null
          responsible: string | null
          severity: Database["public"]["Enums"]["vuln_severity"]
          source: string | null
          status: Database["public"]["Enums"]["vuln_status"]
          status_changed_at: string | null
          system_app: string | null
          treatment_due_date: string | null
          updated_at: string
          vuln_type: string | null
        }
        Insert: {
          closed_at?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          external_id?: string | null
          fqdn: string
          id?: string
          identified_at?: string | null
          kind?: string
          mitigation_description?: string | null
          pending_approval?: boolean | null
          pending_at?: string | null
          pending_by?: string | null
          pending_status?: string | null
          raw?: Json | null
          responsible?: string | null
          severity: Database["public"]["Enums"]["vuln_severity"]
          source?: string | null
          status?: Database["public"]["Enums"]["vuln_status"]
          status_changed_at?: string | null
          system_app?: string | null
          treatment_due_date?: string | null
          updated_at?: string
          vuln_type?: string | null
        }
        Update: {
          closed_at?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          external_id?: string | null
          fqdn?: string
          id?: string
          identified_at?: string | null
          kind?: string
          mitigation_description?: string | null
          pending_approval?: boolean | null
          pending_at?: string | null
          pending_by?: string | null
          pending_status?: string | null
          raw?: Json | null
          responsible?: string | null
          severity?: Database["public"]["Enums"]["vuln_severity"]
          source?: string | null
          status?: Database["public"]["Enums"]["vuln_status"]
          status_changed_at?: string | null
          system_app?: string | null
          treatment_due_date?: string | null
          updated_at?: string
          vuln_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vulnerabilities_aplicacao_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      vulnerabilities_infra: {
        Row: {
          closed_at: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          external_id: string | null
          fqdn: string
          fqdn_norm: string | null
          id: string
          identified_at: string | null
          kind: string
          mitigation_description: string | null
          pending_approval: boolean | null
          pending_at: string | null
          pending_by: string | null
          pending_status: string | null
          porta_norm: string | null
          presumed_closed: boolean
          raw: Json | null
          reopened_at: string | null
          responsible: string | null
          severity: Database["public"]["Enums"]["vuln_severity"]
          source: string | null
          status: Database["public"]["Enums"]["vuln_status"]
          status_changed_at: string | null
          system_app: string | null
          treatment_due_date: string | null
          updated_at: string
          vuln_type: string | null
          vuln_type_norm: string | null
        }
        Insert: {
          closed_at?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          external_id?: string | null
          fqdn: string
          fqdn_norm?: string | null
          id?: string
          identified_at?: string | null
          kind?: string
          mitigation_description?: string | null
          pending_approval?: boolean | null
          pending_at?: string | null
          pending_by?: string | null
          pending_status?: string | null
          porta_norm?: string | null
          presumed_closed?: boolean
          raw?: Json | null
          reopened_at?: string | null
          responsible?: string | null
          severity: Database["public"]["Enums"]["vuln_severity"]
          source?: string | null
          status?: Database["public"]["Enums"]["vuln_status"]
          status_changed_at?: string | null
          system_app?: string | null
          treatment_due_date?: string | null
          updated_at?: string
          vuln_type?: string | null
          vuln_type_norm?: string | null
        }
        Update: {
          closed_at?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          external_id?: string | null
          fqdn?: string
          fqdn_norm?: string | null
          id?: string
          identified_at?: string | null
          kind?: string
          mitigation_description?: string | null
          pending_approval?: boolean | null
          pending_at?: string | null
          pending_by?: string | null
          pending_status?: string | null
          porta_norm?: string | null
          presumed_closed?: boolean
          raw?: Json | null
          reopened_at?: string | null
          responsible?: string | null
          severity?: Database["public"]["Enums"]["vuln_severity"]
          source?: string | null
          status?: Database["public"]["Enums"]["vuln_status"]
          status_changed_at?: string | null
          system_app?: string | null
          treatment_due_date?: string | null
          updated_at?: string
          vuln_type?: string | null
          vuln_type_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vulnerabilities_infra_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      wsus_servers: {
        Row: {
          computer_name: string
          created_at: string
          created_by: string | null
          failed: number
          has_alert: boolean | null
          id: string
          installed_or_na: number
          last_report_at: string | null
          needed: number
          no_status: number
          not_installed: number | null
          raw: Json | null
          updated_at: string
        }
        Insert: {
          computer_name: string
          created_at?: string
          created_by?: string | null
          failed?: number
          has_alert?: boolean | null
          id?: string
          installed_or_na?: number
          last_report_at?: string | null
          needed?: number
          no_status?: number
          not_installed?: number | null
          raw?: Json | null
          updated_at?: string
        }
        Update: {
          computer_name?: string
          created_at?: string
          created_by?: string | null
          failed?: number
          has_alert?: boolean | null
          id?: string
          installed_or_na?: number
          last_report_at?: string | null
          needed?: number
          no_status?: number
          not_installed?: number | null
          raw?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      zabbix_hosts_cache: {
        Row: {
          error: string | null
          hosts: string[]
          id: string
          ip_to_host: Json
          ips: string[]
          synced_at: string | null
          unknown_hosts: string[]
          unknown_ips: string[]
        }
        Insert: {
          error?: string | null
          hosts?: string[]
          id?: string
          ip_to_host?: Json
          ips?: string[]
          synced_at?: string | null
          unknown_hosts?: string[]
          unknown_ips?: string[]
        }
        Update: {
          error?: string | null
          hosts?: string[]
          id?: string
          ip_to_host?: Json
          ips?: string[]
          synced_at?: string | null
          unknown_hosts?: string[]
          unknown_ips?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      vw_ranking_ia_usuarios: {
        Row: {
          total_acessos: number | null
          ultimo_acesso: string | null
          user_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_role_defaults: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      bulk_update_vuln_status: {
        Args: { p_table: string; p_updates: Json }
        Returns: undefined
      }
      calcular_delta_anterior: {
        Args: { _ordem: number; _score: number; _seg: string }
        Returns: number
      }
      calcular_score: {
        Args: { _isoa: number; _nista: number }
        Returns: number
      }
      close_missing_infra_vulns: {
        Args: { p_reference_at: string; p_rows: Json }
        Returns: undefined
      }
      get_exec_ia_overview: { Args: { p_since: string }; Returns: Json }
      get_exec_vulnerabilities_overview: {
        Args: { p_since30: string; p_since60: string }
        Returns: Json
      }
      get_ia_ranking_overview: {
        Args: {
          p_dept?: string
          p_from: string
          p_to: string
          p_tool?: string
          p_unit?: string
          p_user?: string
        }
        Returns: Json
      }
      get_ranking_ia_usuarios: {
        Args: {
          p_dept?: string
          p_from: string
          p_limit?: number
          p_to: string
          p_tool?: string
          p_unit?: string
        }
        Returns: Json
      }
      get_sophos_top_users_threats: {
        Args: { from_ts: string; to_ts: string }
        Returns: {
          cnt: number
          user_normalized: string
        }[]
      }
      get_sso_public_config: {
        Args: never
        Returns: {
          allowed_domains: string[]
          azure_client_id: string
          azure_tenant_id: string
          oauth_enabled: boolean
          saml_enabled: boolean
        }[]
      }
      has_module_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_module_admin: { Args: { _user_id: string }; Returns: boolean }
      is_dast_allowed: { Args: { _uid: string }; Returns: boolean }
      is_module_admin: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      recalcular_maturidade_segmento: {
        Args: { _seg: string }
        Returns: undefined
      }
      register_sast_scan_run: { Args: { p_run: Json }; Returns: number }
      schedule_hook_cron: {
        Args: { p_hook_url: string; p_job_name: string; p_schedule: string }
        Returns: undefined
      }
      sophos_encryption_summary: {
        Args: never
        Returns: {
          category: string
          encrypted: boolean
          total: number
        }[]
      }
      sophos_overview: {
        Args: { from_ts: string; to_ts: string }
        Returns: Json
      }
      sophos_unencrypted_device_class: {
        Args: never
        Returns: {
          device_class: string
          total: number
        }[]
      }
      unschedule_hook_cron: { Args: { p_job_name: string }; Returns: undefined }
      update_cron_hook_domain: {
        Args: {
          p_dry_run?: boolean
          p_new_domain: string
          p_old_domain: string
        }
        Returns: {
          job_name: string
          new_command: string
          old_command: string
          schedule: string
        }[]
      }
      upsert_dast_recon_subdomains: {
        Args: { p_rows: Json }
        Returns: undefined
      }
      upsert_dast_vulnerability: { Args: { p_rows: Json }; Returns: undefined }
      upsert_sast_detections: { Args: { p_rows: Json }; Returns: number }
      upsert_sek_tickets: { Args: { p_rows: Json }; Returns: undefined }
      upsert_shadowit_finding: { Args: { p_rows: Json }; Returns: undefined }
      upsert_shadowit_hosts: { Args: { p_rows: Json }; Returns: undefined }
      upsert_vuln_infra: { Args: { p_rows: Json }; Returns: undefined }
      user_department_id: { Args: { _user_id: string }; Returns: string }
      vulnerabilities_compute_closed_at: {
        Args: { _raw: Json; _status: string; _updated_at: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "analista"
        | "visualizador"
        | "personalizado"
        | "super_admin"
      gmud_aprov_status:
        | "Pendente"
        | "Aprovado"
        | "Rejeitado"
        | "Cancelado"
        | "Dispensado"
      gmud_impacto: "Baixo" | "Médio" | "Alto"
      gmud_status:
        | "Rascunho"
        | "Em Aprovação"
        | "Aprovada"
        | "Rejeitada"
        | "Em Execução"
        | "Concluída"
        | "Rollback"
        | "Cancelada"
      gmud_tipo: "Normal" | "Padrão" | "Emergencial"
      policy_status: "Publicada" | "Em Validação" | "Revisão"
      vuln_severity: "Crítica" | "Alta" | "Média" | "Baixa"
      vuln_status: "Aberta" | "Em tratamento" | "Mitigada" | "Fechada"
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
      app_role: [
        "admin",
        "analista",
        "visualizador",
        "personalizado",
        "super_admin",
      ],
      gmud_aprov_status: [
        "Pendente",
        "Aprovado",
        "Rejeitado",
        "Cancelado",
        "Dispensado",
      ],
      gmud_impacto: ["Baixo", "Médio", "Alto"],
      gmud_status: [
        "Rascunho",
        "Em Aprovação",
        "Aprovada",
        "Rejeitada",
        "Em Execução",
        "Concluída",
        "Rollback",
        "Cancelada",
      ],
      gmud_tipo: ["Normal", "Padrão", "Emergencial"],
      policy_status: ["Publicada", "Em Validação", "Revisão"],
      vuln_severity: ["Crítica", "Alta", "Média", "Baixa"],
      vuln_status: ["Aberta", "Em tratamento", "Mitigada", "Fechada"],
    },
  },
} as const
