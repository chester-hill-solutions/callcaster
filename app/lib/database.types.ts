export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined, verification_status?: string }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audience: {
        Row: {
          created_at: string
          id: number
          is_conditional: boolean
          name: string | null
          workspace: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_conditional?: boolean
          name?: string | null
          workspace?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_conditional?: boolean
          name?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_rule: {
        Row: {
          audience_id: number
          conditions: Json
          created_at: string
          id: number
          logic: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          audience_id: number
          conditions?: Json
          created_at?: string
          id?: number
          logic?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          audience_id?: number
          conditions?: Json
          created_at?: string
          id?: number
          logic?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_rule_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audience"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_rule_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      call: {
        Row: {
          account_sid: string | null
          answered_by: Database["public"]["Enums"]["answered_by"] | null
          answers: Json | null
          api_version: string | null
          call_duration: number | null
          caller_name: string | null
          campaign_id: number | null
          conference_id: string | null
          contact_id: number | null
          date_created: string
          date_updated: string | null
          direction: string | null
          duration: string | null
          end_time: string | null
          forwarded_from: string | null
          from: string | null
          from_formatted: string | null
          group_sid: string | null
          is_last: boolean
          outreach_attempt_id: number | null
          parent_call_sid: string | null
          phone_number_sid: string | null
          price: string | null
          price_unit: string | null
          queue_id: number | null
          queue_time: string | null
          recording_duration: string | null
          recording_sid: string | null
          recording_url: string | null
          sid: string
          start_time: string | null
          status: Database["public"]["Enums"]["call_status"] | null
          subresource_uris: Json | null
          to: string | null
          to_formatted: string | null
          trunk_sid: string | null
          uri: string | null
          workspace: string | null
        }
        Insert: {
          account_sid?: string | null
          answered_by?: Database["public"]["Enums"]["answered_by"] | null
          answers?: Json | null
          api_version?: string | null
          call_duration?: number | null
          caller_name?: string | null
          campaign_id?: number | null
          conference_id?: string | null
          contact_id?: number | null
          date_created?: string
          date_updated?: string | null
          direction?: string | null
          duration?: string | null
          end_time?: string | null
          forwarded_from?: string | null
          from?: string | null
          from_formatted?: string | null
          group_sid?: string | null
          is_last?: boolean
          outreach_attempt_id?: number | null
          parent_call_sid?: string | null
          phone_number_sid?: string | null
          price?: string | null
          price_unit?: string | null
          queue_id?: number | null
          queue_time?: string | null
          recording_duration?: string | null
          recording_sid?: string | null
          recording_url?: string | null
          sid: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["call_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          to_formatted?: string | null
          trunk_sid?: string | null
          uri?: string | null
          workspace?: string | null
        }
        Update: {
          account_sid?: string | null
          answered_by?: Database["public"]["Enums"]["answered_by"] | null
          answers?: Json | null
          api_version?: string | null
          call_duration?: number | null
          caller_name?: string | null
          campaign_id?: number | null
          conference_id?: string | null
          contact_id?: number | null
          date_created?: string
          date_updated?: string | null
          direction?: string | null
          duration?: string | null
          end_time?: string | null
          forwarded_from?: string | null
          from?: string | null
          from_formatted?: string | null
          group_sid?: string | null
          is_last?: boolean
          outreach_attempt_id?: number | null
          parent_call_sid?: string | null
          phone_number_sid?: string | null
          price?: string | null
          price_unit?: string | null
          queue_id?: number | null
          queue_time?: string | null
          recording_duration?: string | null
          recording_sid?: string | null
          recording_url?: string | null
          sid?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["call_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          to_formatted?: string | null
          trunk_sid?: string | null
          uri?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_outreach_attempt_id_fkey"
            columns: ["outreach_attempt_id"]
            isOneToOne: false
            referencedRelation: "outreach_attempt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_parent_call_sid_fkey"
            columns: ["parent_call_sid"]
            isOneToOne: false
            referencedRelation: "call"
            referencedColumns: ["sid"]
          },
          {
            foreignKeyName: "call_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "campaign_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign: {
        Row: {
          call_questions: Json | null
          caller_id: string | null
          created_at: string
          dial_ratio: number
          dial_type: Database["public"]["Enums"]["dial_types"] | null
          end_date: string | null
          group_household_queue: boolean
          id: number
          is_active: boolean
          schedule: Json | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          title: string
          type: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file: string | null
          workspace: string | null
        }
        Insert: {
          call_questions?: Json | null
          caller_id?: string | null
          created_at?: string
          dial_ratio?: number
          dial_type?: Database["public"]["Enums"]["dial_types"] | null
          end_date?: string | null
          group_household_queue?: boolean
          id?: number
          is_active?: boolean
          schedule?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          title?: string
          type?: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file?: string | null
          workspace?: string | null
        }
        Update: {
          call_questions?: Json | null
          caller_id?: string | null
          created_at?: string
          dial_ratio?: number
          dial_type?: Database["public"]["Enums"]["dial_types"] | null
          end_date?: string | null
          group_household_queue?: boolean
          id?: number
          is_active?: boolean
          schedule?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          title?: string
          type?: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_audience: {
        Row: {
          audience_id: number
          campaign_id: number
          created_at: string
        }
        Insert: {
          audience_id: number
          campaign_id?: number
          created_at?: string
        }
        Update: {
          audience_id?: number
          campaign_id?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_audiences_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audience"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_audiences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_queue: {
        Row: {
          attempts: number
          campaign_id: number
          contact_id: number
          created_at: string
          id: number
          queue_order: number | null
          status: string
        }
        Insert: {
          attempts?: number
          campaign_id: number
          contact_id: number
          created_at?: string
          id?: number
          queue_order?: number | null
          status?: string
        }
        Update: {
          attempts?: number
          campaign_id?: number
          contact_id?: number
          created_at?: string
          id?: number
          queue_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_schedule_jobs: {
        Row: {
          campaign_id: number
          end_ids: number[] | null
          end_job_id: number | null
          start_ids: number[] | null
          start_job_id: number | null
        }
        Insert: {
          campaign_id: number
          end_ids?: number[] | null
          end_job_id?: number | null
          start_ids?: number[] | null
          start_job_id?: number | null
        }
        Update: {
          campaign_id?: number
          end_ids?: number[] | null
          end_job_id?: number | null
          start_ids?: number[] | null
          start_job_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_schedule_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          address: string | null
          address_id: string | null
          carrier: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date_updated: string | null
          email: string | null
          external_id: string | null
          firstname: string | null
          id: number
          opt_out: boolean | null
          other_data: Json[]
          phone: string | null
          postal: string | null
          province: string | null
          surname: string | null
          workspace: string | null
          fullname: string | null
        }
        Insert: {
          address?: string | null
          address_id?: string | null
          carrier?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date_updated?: string | null
          email?: string | null
          external_id?: string | null
          firstname?: string | null
          id?: number
          opt_out?: boolean | null
          other_data?: Json[]
          phone?: string | null
          postal?: string | null
          province?: string | null
          surname?: string | null
          workspace?: string | null
        }
        Update: {
          address?: string | null
          address_id?: string | null
          carrier?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date_updated?: string | null
          email?: string | null
          external_id?: string | null
          firstname?: string | null
          id?: number
          opt_out?: boolean | null
          other_data?: Json[]
          phone?: string | null
          postal?: string | null
          province?: string | null
          surname?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_audience: {
        Row: {
          audience_id: number
          contact_id: number
          created_at: string
        }
        Insert: {
          audience_id: number
          contact_id?: number
          created_at?: string
        }
        Update: {
          audience_id?: number
          contact_id?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_audiences_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audience"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_audiences_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      email: {
        Row: {
          created_at: string
          created_by: string | null
          design: Json | null
          id: number
          name: string
          updated_at: string | null
          updated_by: string | null
          workspace: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          design?: Json | null
          id?: number
          name?: string
          updated_at?: string | null
          updated_by?: string | null
          workspace?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          design?: Json | null
          id?: number
          name?: string
          updated_at?: string | null
          updated_by?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign: {
        Row: {
          campaign_id: number
          created_at: string
          email_id: number | null
          id: number
          workspace: string
        }
        Insert: {
          campaign_id: number
          created_at?: string
          email_id?: number | null
          id?: number
          workspace: string
        }
        Update: {
          campaign_id?: number
          created_at?: string
          email_id?: number | null
          id?: number
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      ivr_campaign: {
        Row: {
          campaign_id: number
          created_at: string
          id: number
          script_id: number | null
          workspace: string
        }
        Insert: {
          campaign_id: number
          created_at?: string
          id?: number
          script_id?: number | null
          workspace: string
        }
        Update: {
          campaign_id?: number
          created_at?: string
          id?: number
          script_id?: number | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "ivr_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ivr_campaign_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "script"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ivr_campaign_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      live_campaign: {
        Row: {
          campaign_id: number | null
          created_at: string
          disposition_options: Json
          id: number
          questions: Json
          script_id: number | null
          voicedrop_audio: string | null
          workspace: string
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string
          disposition_options?: Json
          id?: number
          questions?: Json
          script_id?: number | null
          voicedrop_audio?: string | null
          workspace?: string
        }
        Update: {
          campaign_id?: number | null
          created_at?: string
          disposition_options?: Json
          id?: number
          questions?: Json
          script_id?: number | null
          voicedrop_audio?: string | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_campaign_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "script"
            referencedColumns: ["id"]
          },
        ]
      }
      message: {
        Row: {
          account_sid: string | null
          api_version: string | null
          body: string | null
          campaign_id: number | null
          contact_id: number | null
          date_created: string | null
          date_sent: string | null
          date_updated: string | null
          direction: Database["public"]["Enums"]["message_direction"] | null
          error_code: number | null
          error_message: string | null
          from: string | null
          inbound_media: string[] | null
          messaging_service_sid: string | null
          num_media: string | null
          num_segments: string | null
          outbound_media: string[] | null
          outreach_attempt_id: number | null
          price: string | null
          price_unit: string | null
          sid: string
          status: Database["public"]["Enums"]["message_status"] | null
          subresource_uris: Json | null
          to: string | null
          uri: string | null
          workspace: string
        }
        Insert: {
          account_sid?: string | null
          api_version?: string | null
          body?: string | null
          campaign_id?: number | null
          contact_id?: number | null
          date_created?: string | null
          date_sent?: string | null
          date_updated?: string | null
          direction?: Database["public"]["Enums"]["message_direction"] | null
          error_code?: number | null
          error_message?: string | null
          from?: string | null
          inbound_media?: string[] | null
          messaging_service_sid?: string | null
          num_media?: string | null
          num_segments?: string | null
          outbound_media?: string[] | null
          outreach_attempt_id?: number | null
          price?: string | null
          price_unit?: string | null
          sid: string
          status?: Database["public"]["Enums"]["message_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          uri?: string | null
          workspace: string
        }
        Update: {
          account_sid?: string | null
          api_version?: string | null
          body?: string | null
          campaign_id?: number | null
          contact_id?: number | null
          date_created?: string | null
          date_sent?: string | null
          date_updated?: string | null
          direction?: Database["public"]["Enums"]["message_direction"] | null
          error_code?: number | null
          error_message?: string | null
          from?: string | null
          inbound_media?: string[] | null
          messaging_service_sid?: string | null
          num_media?: string | null
          num_segments?: string | null
          outbound_media?: string[] | null
          outreach_attempt_id?: number | null
          price?: string | null
          price_unit?: string | null
          sid?: string
          status?: Database["public"]["Enums"]["message_status"] | null
          subresource_uris?: Json | null
          to?: string | null
          uri?: string | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outreach_attempt_id_fkey"
            columns: ["outreach_attempt_id"]
            isOneToOne: false
            referencedRelation: "outreach_attempt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaign: {
        Row: {
          body_text: string | null
          campaign_id: number | null
          created_at: string
          id: number
          message_media: string[] | null
          workspace: string
        }
        Insert: {
          body_text?: string | null
          campaign_id?: number | null
          created_at?: string
          id?: number
          message_media?: string[] | null
          workspace: string
        }
        Update: {
          body_text?: string | null
          campaign_id?: number | null
          created_at?: string
          id?: number
          message_media?: string[] | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_campaign_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaign_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_attempt: {
        Row: {
          answered_at: string | null
          campaign_id: number
          contact_id: number
          created_at: string
          current_step: string | null
          disposition: string | null
          ended_at: string | null
          id: number
          result: Json
          user_id: string | null
          workspace: string
        }
        Insert: {
          answered_at?: string | null
          campaign_id: number
          contact_id: number
          created_at?: string
          current_step?: string | null
          disposition?: string | null
          ended_at?: string | null
          id?: number
          result?: Json
          user_id?: string | null
          workspace?: string
        }
        Update: {
          answered_at?: string | null
          campaign_id?: number
          contact_id?: number
          created_at?: string
          current_step?: string | null
          disposition?: string | null
          ended_at?: string | null
          id?: number
          result?: Json
          user_id?: string | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_attempt_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_attempt_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_attempt_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      script: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          name: string
          steps: Json | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          workspace: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          name?: string
          steps?: Json | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          workspace?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          name?: string
          steps?: Json | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "script_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      twilio_cancellation_queue: {
        Row: {
          call_sid: string
          created_at: string
          id: number
          processed_at: string | null
          workspace: string
        }
        Insert: {
          call_sid: string
          created_at?: string
          id?: number
          processed_at?: string | null
          workspace: string
        }
        Update: {
          call_sid?: string
          created_at?: string
          id?: number
          processed_at?: string | null
          workspace?: string
        }
        Relationships: []
      }
      user: {
        Row: {
          access_level: string | null
          activity: Json
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          organization: number | null
          username: string
        }
        Insert: {
          access_level?: string | null
          activity?: Json
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          organization?: number | null
          username?: string
        }
        Update: {
          access_level?: string | null
          activity?: Json
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization?: number | null
          username?: string
        }
        Relationships: []
      }
      webhook: {
        Row: {
          created_at: string
          custom_headers: Json
          destination_url: string
          event: string[]
          id: number
          type: string | null
          updated_at: string | null
          updated_by: string | null
          workspace: string
        }
        Insert: {
          created_at?: string
          custom_headers?: Json
          destination_url: string
          event?: string[]
          id?: number
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          workspace: string
        }
        Update: {
          created_at?: string
          custom_headers?: Json
          destination_url?: string
          event?: string[]
          id?: number
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace: {
        Row: {
          created_at: string
          cutoff_time: string
          disabled: boolean
          feature_flags: Json
          id: string
          key: string | null
          name: string
          owner: string | null
          stripe_id: string | null
          token: string | null
          twilio_data: Json
          users: string[] | null
        }
        Insert: {
          created_at?: string
          cutoff_time?: string
          disabled?: boolean
          feature_flags?: Json
          id?: string
          key?: string | null
          name?: string
          owner?: string | null
          stripe_id?: string | null
          token?: string | null
          twilio_data?: Json
          users?: string[] | null
        }
        Update: {
          created_at?: string
          cutoff_time?: string
          disabled?: boolean
          feature_flags?: Json
          id?: string
          key?: string | null
          name?: string
          owner?: string | null
          stripe_id?: string | null
          token?: string | null
          twilio_data?: Json
          users?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invite: {
        Row: {
          created_at: string
          id: string
          isNew: boolean
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace: string
        }
        Insert: {
          created_at?: string
          id?: string
          isNew?: boolean
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace?: string
        }
        Update: {
          created_at?: string
          id?: string
          isNew?: boolean
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invite_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invite_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_number: {
        Row: {
          capabilities: Json | null
          created_at: string
          friendly_name: string | null
          id: number
          inbound_action: string | null
          inbound_audio: string | null
          phone_number: string | null
          type: string
          workspace: string
        }
        Insert: {
          capabilities?: Json | null
          created_at?: string
          friendly_name?: string | null
          id?: number
          inbound_action?: string | null
          inbound_audio?: string | null
          phone_number?: string | null
          type: string
          workspace: string
        }
        Update: {
          capabilities?: Json | null
          created_at?: string
          friendly_name?: string | null
          id?: number
          inbound_action?: string | null
          inbound_audio?: string | null
          phone_number?: string | null
          type?: string
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_number_workspace_fkey"
            columns: ["workspace"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_permissions: {
        Row: {
          id: number
          permission: Database["public"]["Enums"]["workspace_permission"]
          role: Database["public"]["Enums"]["workspace_role"]
        }
        Insert: {
          id?: number
          permission: Database["public"]["Enums"]["workspace_permission"]
          role: Database["public"]["Enums"]["workspace_role"]
        }
        Update: {
          id?: number
          permission?: Database["public"]["Enums"]["workspace_permission"]
          role?: Database["public"]["Enums"]["workspace_role"]
        }
        Relationships: []
      }
      workspace_users: {
        Row: {
          created_at: string
          id: number
          last_accessed: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          last_accessed?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: number
          last_accessed?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_contact_to_all_campaign_queues: {
        Args: {
          contact_id_param: number
          audience_id_param: number
        }
        Returns: undefined
      }
      authorize: {
        Args: {
          selected_workspace_id: string
          requested_permission: Database["public"]["Enums"]["workspace_permission"]
        }
        Returns: boolean
      }
      auto_dial_queue: {
        Args: {
          campaign_id_variable: number
          user_id_variable: string
        }
        Returns: {
          contact_id: number
          queue_id: number
          caller_id: string
          contact_phone: string
        }[]
      }
      call_edge_function: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cancel_messages: {
        Args: {
          message_ids: string[]
        }
        Returns: undefined
      }
      cancel_outreach_attempts: {
        Args: {
          call_ids: number[]
        }
        Returns: undefined
      }
      create_cron_job: {
        Args: {
          p_job_name: string
          p_schedule: string
          p_command: string
        }
        Returns: {
          job_id: number
          job_name: string
          schedule: string
          command: string
        }[]
      }
      create_new_workspace:
        | {
            Args: {
              new_workspace_name: string
            }
            Returns: string
          }
        | {
            Args: {
              new_workspace_name: string
              user_id: string
            }
            Returns: string
          }
      create_outreach_attempt: {
        Args: {
          con_id: number
          cam_id: number
          usr_id: string
          wks_id: string
          queue_id: number
        }
        Returns: number
      }
      custom_access_token_hook: {
        Args: {
          event: Json
        }
        Returns: Json
      }
      dequeue_contact: {
        Args: {
          passed_contact_id: number
          group_on_household: boolean
        }
        Returns: undefined
      }
      dequeue_household: {
        Args: {
          contact_id_variable: number
        }
        Returns: undefined
      }
      find_contact_by_phone: {
        Args: {
          p_phone_number: string
          p_workspace_id: string
        }
        Returns: {
          address: string | null
          address_id: string | null
          carrier: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date_updated: string | null
          email: string | null
          external_id: string | null
          firstname: string | null
          id: number
          opt_out: boolean | null
          other_data: Json[]
          phone: string | null
          postal: string | null
          province: string | null
          surname: string | null
          workspace: string | null
        }[]
      }
      fullname: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      generate_cron_expressions: {
        Args: {
          schedule: Json
        }
        Returns: {
          start_cron: string
          end_cron: string
        }[]
      }
      get_active_cron_jobs: {
        Args: Record<PropertyKey, never>
        Returns: {
          jobid: number
          jobname: string
          schedule: string
          command: string
          nodename: string
          nodeport: number
          database: unknown
          username: unknown
          active: boolean
          last_run_time: string
          next_run_time: string
        }[]
      }
      get_audiences_by_campaign: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          created_at: string
          id: number
          is_conditional: boolean
          name: string | null
          workspace: string | null
        }[]
      }
      get_basic_results: {
        Args: {
          campaign_id_param: number
        }
        Returns: {
          disposition: string
          count: number
          average_call_duration: unknown
          expected_total: number
        }[]
      }
      get_calls_by_campaign: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          account_sid: string | null
          answered_by: Database["public"]["Enums"]["answered_by"] | null
          answers: Json | null
          api_version: string | null
          call_duration: number | null
          caller_name: string | null
          campaign_id: number | null
          conference_id: string | null
          contact_id: number | null
          date_created: string
          date_updated: string | null
          direction: string | null
          duration: string | null
          end_time: string | null
          forwarded_from: string | null
          from: string | null
          from_formatted: string | null
          group_sid: string | null
          is_last: boolean
          outreach_attempt_id: number | null
          parent_call_sid: string | null
          phone_number_sid: string | null
          price: string | null
          price_unit: string | null
          queue_id: number | null
          queue_time: string | null
          recording_duration: string | null
          recording_sid: string | null
          recording_url: string | null
          sid: string
          start_time: string | null
          status: Database["public"]["Enums"]["call_status"] | null
          subresource_uris: Json | null
          to: string | null
          to_formatted: string | null
          trunk_sid: string | null
          uri: string | null
          workspace: string | null
        }[]
      }
      get_campaign_audience_contacts: {
        Args: {
          selected_campaign_ids: number[]
        }
        Returns: Database["public"]["CompositeTypes"]["campaigndata"][]
      }
      get_campaign_queue: {
        Args: {
          campaign_id_pro: number
        }
        Returns: {
          id: number
          contact_id: number
          phone: string
          workspace: string
          caller_id: string
        }[]
      }
      get_campaign_stats: {
        Args: {
          campaign_id_param: number
        }
        Returns: {
          disposition: string
          count: number
          average_call_duration: unknown
          average_wait_time: unknown
          expected_total: number
        }[]
      }
      get_campaigns_by_workspace: {
        Args: {
          workspace_id: string
        }
        Returns: {
          call_questions: Json | null
          caller_id: string | null
          created_at: string
          dial_ratio: number
          dial_type: Database["public"]["Enums"]["dial_types"] | null
          end_date: string | null
          group_household_queue: boolean
          id: number
          is_active: boolean
          schedule: Json | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          title: string
          type: Database["public"]["Enums"]["campaign_type"] | null
          voicemail_file: string | null
          workspace: string | null
        }[]
      }
      get_contacts_by_audience: {
        Args: {
          selected_audience_id: number
        }
        Returns: {
          address: string | null
          address_id: string | null
          carrier: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date_updated: string | null
          email: string | null
          external_id: string | null
          firstname: string | null
          id: number
          opt_out: boolean | null
          other_data: Json[]
          phone: string | null
          postal: string | null
          province: string | null
          surname: string | null
          workspace: string | null
        }[]
      }
      get_contacts_by_campaign: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          address: string | null
          address_id: string | null
          carrier: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date_updated: string | null
          email: string | null
          external_id: string | null
          firstname: string | null
          id: number
          opt_out: boolean | null
          other_data: Json[]
          phone: string | null
          postal: string | null
          province: string | null
          surname: string | null
          workspace: string | null
        }[]
      }
      get_contacts_by_households: {
        Args: {
          selected_campaign_id: number
          households_limit: number
        }
        Returns: {
          id: number
          firstname: string
          surname: string
          phone: string
          email: string
          address: string
          city: string
          carrier: string
          opt_out: boolean
          created_at: string
          workspace: string
          queue_id: number
          queue_order: number
          attempts: number
        }[]
      }
      get_conversation_summary: {
        Args: {
          p_workspace: string
        }
        Returns: {
          contact_phone: string
          user_phone: string
          conversation_start: string
          conversation_last_update: string
          message_count: number
          unread_count: number
          contact_firstname: string
          contact_surname: string
        }[]
      }
      get_conversation_summary_by_campaign: {
        Args: {
          p_workspace: string
          campaign_id_prop: number
        }
        Returns: {
          contact_phone: string
          user_phone: string
          conversation_start: string
          conversation_last_update: string
          message_count: number
          unread_count: number
          contact_firstname: string
          contact_surname: string
        }[]
      }
      get_dynamic_outreach_results: {
        Args: {
          campaign_id_param: number
        }
        Returns: {
          external_id: string
          disposition: string
          call_duration: unknown
          firstname: string
          surname: string
          phone: string
          username: string
          created_at: string
          full_result: Json
          dynamic_columns: Json
        }[]
      }
      get_last_online: {
        Args: Record<PropertyKey, never>
        Returns: {
          campaign_id: number
          status: string
          dial_type: Database["public"]["Enums"]["dial_types"]
          last_online: string
        }[]
      }
      get_outreach_attempts: {
        Args: {
          campaign_id_param: number
          workspace_id_param: string
        }
        Returns: {
          id: number
          disposition: string
          created_at: string
          firstname: string
          surname: string
          phone: string
          sid: number
        }[]
      }
      get_outreach_data_column_definitions: {
        Args: {
          campaign_id_param: number
        }
        Returns: string
      }
      get_outreach_data_column_names: {
        Args: {
          campaign_id_param: number
        }
        Returns: string
      }
      get_outreach_data_column_structure: {
        Args: {
          campaign_id_param: number
        }
        Returns: string
      }
      get_outreach_results: {
        Args: {
          campaign_id_param: number
        }
        Returns: {
          external_id: string
          disposition: string
          call_duration: unknown
          firstname: string
          surname: string
          phone: string
          full_result: Json
          dynamic_columns: Json
        }[]
      }
      get_pivoted_outreach_data: {
        Args: {
          campaign_id_param: number
        }
        Returns: Record<string, unknown>[]
      }
      get_queued_contacts: {
        Args: {
          selected_campaign_id: number
        }
        Returns: {
          id: number
          firstname: string
          surname: string
          phone: string
          email: string
          address: string
          city: string
          carrier: string
          opt_out: boolean
          created_at: string
          workspace: string
          queue_id: number
          queue_order: number
          attempts: number
        }[]
      }
      get_workspace_users: {
        Args: {
          selected_workspace_id: string
        }
        Returns: {
          id: string
          username: string
          first_name: string
          last_name: string
          user_workspace_role: Database["public"]["Enums"]["workspace_role"]
        }[]
      }
      handle_campaign_queue_entry: {
        Args: {
          p_contact_id: number
          p_campaign_id: number
          p_queue_order?: number
          p_requeue?: boolean
        }
        Returns: number
      }

      process_existing_contacts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      select_and_update_campaign_contacts: {
        Args: {
          p_campaign_id: number
          p_initial_limit: number
        }
        Returns: {
          queue_id: number
          contact_id: number
        }[]
      }
      test_authorize: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      update_column_value: {
        Args: {
          p_table_name: string
          p_column_name: string
          p_id: number
          p_increment: boolean
        }
        Returns: undefined
      }
      update_user_workspace_last_access_time: {
        Args: {
          selected_workspace_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      answered_by: "human" | "machine" | "unknown"
      call_status:
        | "queued"
        | "ringing"
        | "in-progress"
        | "canceled"
        | "completed"
        | "failed"
        | "busy"
        | "no-answer"
        | "initiated"
      campaign_status:
        | "pending"
        | "scheduled"
        | "running"
        | "complete"
        | "paused"
        | "draft"
        | "archived"
      campaign_type:
        | "message"
        | "robocall"
        | "simple_ivr"
        | "complex_ivr"
        | "live_call"
        | "email"
      dial_types: "call" | "predictive"
      message_direction:
        | "inbound"
        | "outbound-api"
        | "outbound-call"
        | "outbound-reply"
      message_status:
        | "accepted"
        | "scheduled"
        | "canceled"
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "delivered"
        | "undelivered"
        | "receiving"
        | "received"
        | "read"
      queue_status: "queued" | "dequeued"
      workspace_permission:
        | "workspace.delete"
        | "workspace.addUser"
        | "workspace.removeUser"
        | "workspace.call"
        | "workspace.addCampaign"
        | "workspace.addAudience"
        | "workspace.addContact"
        | "workspace.editUser"
        | "workspace.editCampaign"
        | "workspace.startCampaign"
        | "workspace.stopCampaign"
        | "workspace.removeCampaign"
        | "workspace.inviteCaller"
        | "workspace.manageCredits"
        | "workspace.pauseCampaign"
        | "workspace.editContact"
        | "workspace.removeContact"
        | "workspace.editAudience"
        | "workspace.removeAudience"
        | "workspace.transferOwnership"
        | "workspace.removeCaller"
        | "workspace.initializeMedia"
        | "workspace.addMedia"
        | "workspace.removeMedia"
      workspace_role: "owner" | "member" | "caller" | "admin"
    }
    CompositeTypes: {
      campaigndata: {
        campaign_id: number | null
        audience_id: number | null
        contact_id: number | null
        firstname: string | null
        surname: string | null
      }
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

  
  export type BlockOption = {
    next: string;
    value?: string;
    content?: string;
  };
  
  export type IVROption = {
    value: number | "vx-any";
    next: string;
    content?: string;
  }

  export type Block = {
    id: string;
    type: "radio" | "dropdown" | "boolean" | "multi" | "textarea" | "textblock" | "audio";
    title: string;
    content: string;
    options: BlockOption[] | IVROption[];
  };

  export type IVRBlock = Block & {
    audioFile: string; 
    speechType: "recorded" | "synthetic";
    responseType: "dtmf" | "speech" | "dtmf speech" | null;
  }
  
  export type Page = {
    id: string;
    title: string;
    blocks: string[];
  };
  
  export type Flow = {
    type: "ivr" | "script";
    pages: {
      [key: string]: Page;
    };
    blocks: {
      [key: string]: Block;
    };
    startPage: string; 
  };


export interface DispositionResult {
      disposition: string;
      count: number;
      average_call_duration: string;
    }
    
export interface ResultsScreenProps {
      totalCalls: number;
      results: DispositionResult[];
      expectedTotal: number;
      isBusy:boolean;
    }
    