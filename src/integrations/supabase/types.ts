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
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          memory_type: string
          metadata: Json | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          memory_type?: string
          metadata?: Json | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          memory_type?: string
          metadata?: Json | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
          source: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data: Json
          expires_at?: string
          id?: string
          source?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      chat_bookmarks: {
        Row: {
          content: string | null
          created_at: string
          environment_context: string
          id: string
          label: string
          message_id: string | null
          peer_id: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          environment_context?: string
          id?: string
          label: string
          message_id?: string | null
          peer_id: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          environment_context?: string
          id?: string
          label?: string
          message_id?: string | null
          peer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_contacts: {
        Row: {
          archived: boolean
          contact_id: string
          created_at: string
          disappear_seconds: number
          environment_context: string
          guard: boolean
          id: string
          muted: boolean
          owner_id: string
          pinned: boolean
        }
        Insert: {
          archived?: boolean
          contact_id: string
          created_at?: string
          disappear_seconds?: number
          environment_context?: string
          guard?: boolean
          id?: string
          muted?: boolean
          owner_id: string
          pinned?: boolean
        }
        Update: {
          archived?: boolean
          contact_id?: string
          created_at?: string
          disappear_seconds?: number
          environment_context?: string
          guard?: boolean
          id?: string
          muted?: boolean
          owner_id?: string
          pinned?: boolean
        }
        Relationships: []
      }
      chat_escrow_deals: {
        Row: {
          amount: number | null
          counterparty_id: string
          created_at: string
          creator_id: string
          environment_context: string
          id: string
          locked_hash: string | null
          signed_by: Json
          status: string
          terms: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          counterparty_id: string
          created_at?: string
          creator_id: string
          environment_context?: string
          id?: string
          locked_hash?: string | null
          signed_by?: Json
          status?: string
          terms: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          counterparty_id?: string
          created_at?: string
          creator_id?: string
          environment_context?: string
          id?: string
          locked_hash?: string | null
          signed_by?: Json
          status?: string
          terms?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      debunked_news: {
        Row: {
          admin_evidence_score: number | null
          ai_reasoning: string
          category: string | null
          claim: string
          created_by: string | null
          debunked_at: string
          evidence_links: string[] | null
          id: string
          image_url: string | null
          original_source: string | null
          title: string
          verdict: string
        }
        Insert: {
          admin_evidence_score?: number | null
          ai_reasoning: string
          category?: string | null
          claim: string
          created_by?: string | null
          debunked_at?: string
          evidence_links?: string[] | null
          id?: string
          image_url?: string | null
          original_source?: string | null
          title: string
          verdict: string
        }
        Update: {
          admin_evidence_score?: number | null
          ai_reasoning?: string
          category?: string | null
          claim?: string
          created_by?: string | null
          debunked_at?: string
          evidence_links?: string[] | null
          id?: string
          image_url?: string | null
          original_source?: string | null
          title?: string
          verdict?: string
        }
        Relationships: []
      }
      joint_account_requests: {
        Row: {
          created_at: string
          from_permissions: Json
          from_user: string
          id: string
          message: string | null
          status: Database["public"]["Enums"]["joint_request_status"]
          to_permissions: Json
          to_user: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_permissions?: Json
          from_user: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["joint_request_status"]
          to_permissions?: Json
          to_user: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_permissions?: Json
          from_user?: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["joint_request_status"]
          to_permissions?: Json
          to_user?: string
          updated_at?: string
        }
        Relationships: []
      }
      joint_accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          permissions_a: Json
          permissions_b: Json
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          permissions_a?: Json
          permissions_b?: Json
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          permissions_a?: Json
          permissions_b?: Json
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      joint_workspace_chats: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          media_url: string | null
          metadata: Json
          read: boolean
          receiver_id: string
          reply_to: string | null
          self_destruct: boolean
          sender_id: string
          viewed_at: string | null
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          read?: boolean
          receiver_id: string
          reply_to?: string | null
          self_destruct?: boolean
          sender_id: string
          viewed_at?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          read?: boolean
          receiver_id?: string
          reply_to?: string | null
          self_destruct?: boolean
          sender_id?: string
          viewed_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_notes: string | null
          ai_verification_result: Json | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          plan: string
          screenshot_url: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
          utr_number: string
        }
        Insert: {
          admin_notes?: string | null
          ai_verification_result?: Json | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          plan?: string
          screenshot_url?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
          utr_number: string
        }
        Update: {
          admin_notes?: string | null
          ai_verification_result?: Json | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          plan?: string
          screenshot_url?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
          utr_number?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "user_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "user_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      private_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read: boolean
          receiver_id: string
          sender_id: string
          shared_workspace_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read?: boolean
          receiver_id: string
          sender_id: string
          shared_workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          receiver_id?: string
          sender_id?: string
          shared_workspace_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          averia_id: string
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          is_pro: boolean
          personal_vault_pin_hash: string | null
          push_subscription: Json | null
          subscription_expires_at: string | null
          subscription_tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          averia_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_pro?: boolean
          personal_vault_pin_hash?: string | null
          push_subscription?: Json | null
          subscription_expires_at?: string | null
          subscription_tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          averia_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_pro?: boolean
          personal_vault_pin_hash?: string | null
          push_subscription?: Json | null
          subscription_expires_at?: string | null
          subscription_tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_news: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          environment_context: string
          id: string
          image_url: string | null
          published_at: string | null
          source: string | null
          title: string
          url: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          environment_context?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source?: string | null
          title: string
          url: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          environment_context?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source?: string | null
          title?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      scan_history: {
        Row: {
          content_type: string
          content_url: string
          created_at: string
          environment_context: string
          id: string
          reasoning: string | null
          trust_score: number
          user_id: string
          verdict: string
        }
        Insert: {
          content_type: string
          content_url: string
          created_at?: string
          environment_context?: string
          id?: string
          reasoning?: string | null
          trust_score: number
          user_id: string
          verdict: string
        }
        Update: {
          content_type?: string
          content_url?: string
          created_at?: string
          environment_context?: string
          id?: string
          reasoning?: string | null
          trust_score?: number
          user_id?: string
          verdict?: string
        }
        Relationships: []
      }
      shared_ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      shared_ai_messages: {
        Row: {
          author_id: string | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          role: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          role: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: []
      }
      shared_third_party_chats: {
        Row: {
          created_at: string
          external_user_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          external_user_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          external_user_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      shared_third_party_messages: {
        Row: {
          author_id: string
          chat_id: string
          content: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          chat_id: string
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_third_party_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "shared_third_party_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_vault_items: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          id: string
          kind: string
          media_url: string | null
          metadata: Json
          title: string | null
          vault_type: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          title?: string | null
          vault_type?: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          title?: string | null
          vault_type?: string
          workspace_id?: string
        }
        Relationships: []
      }
      shared_workspace_permissions: {
        Row: {
          created_at: string
          id: string
          permissions_a: Json
          permissions_b: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions_a?: Json
          permissions_b?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions_a?: Json
          permissions_b?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string
          media_url: string
          user_id: string
          views_count: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url: string
          user_id: string
          views_count?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url?: string
          user_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          admin_response: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          responded_at: string | null
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          responded_at?: string | null
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          responded_at?: string | null
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      trade_activities: {
        Row: {
          action_type: Database["public"]["Enums"]["trade_activity_action"]
          actor_averia_id: string
          actor_id: string
          actor_name: string
          id: string
          price_inr: number | null
          project_id: string
          project_title: string
          target_averia_id: string | null
          target_id: string | null
          target_name: string | null
          timestamp: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["trade_activity_action"]
          actor_averia_id: string
          actor_id: string
          actor_name: string
          id?: string
          price_inr?: number | null
          project_id: string
          project_title: string
          target_averia_id?: string | null
          target_id?: string | null
          target_name?: string | null
          timestamp?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["trade_activity_action"]
          actor_averia_id?: string
          actor_id?: string
          actor_name?: string
          id?: string
          price_inr?: number | null
          project_id?: string
          project_title?: string
          target_averia_id?: string | null
          target_id?: string | null
          target_name?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "trade_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_projects: {
        Row: {
          asking_price_inr: number
          audit_status: Database["public"]["Enums"]["trade_audit_status"]
          category: Database["public"]["Enums"]["trade_asset_category"]
          created_at: string
          current_owner_averia_id: string
          current_owner_id: string
          current_owner_name: string
          demo_url: string | null
          description: string
          id: string
          is_sold: boolean
          seller_averia_id: string
          seller_id: string
          seller_name: string
          seller_qr_code_url: string | null
          seller_upi_id: string
          seller_upi_registered_name: string
          source_code_file_url: string | null
          tech_stack: string[]
          title: string
          updated_at: string
        }
        Insert: {
          asking_price_inr: number
          audit_status?: Database["public"]["Enums"]["trade_audit_status"]
          category: Database["public"]["Enums"]["trade_asset_category"]
          created_at?: string
          current_owner_averia_id: string
          current_owner_id: string
          current_owner_name: string
          demo_url?: string | null
          description: string
          id?: string
          is_sold?: boolean
          seller_averia_id: string
          seller_id: string
          seller_name: string
          seller_qr_code_url?: string | null
          seller_upi_id: string
          seller_upi_registered_name: string
          source_code_file_url?: string | null
          tech_stack?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          asking_price_inr?: number
          audit_status?: Database["public"]["Enums"]["trade_audit_status"]
          category?: Database["public"]["Enums"]["trade_asset_category"]
          created_at?: string
          current_owner_averia_id?: string
          current_owner_id?: string
          current_owner_name?: string
          demo_url?: string | null
          description?: string
          id?: string
          is_sold?: boolean
          seller_averia_id?: string
          seller_id?: string
          seller_name?: string
          seller_qr_code_url?: string | null
          seller_upi_id?: string
          seller_upi_registered_name?: string
          source_code_file_url?: string | null
          tech_stack?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_transactions: {
        Row: {
          buyer_averia_id: string
          buyer_id: string
          buyer_name: string
          buyer_otp_verified: boolean
          buyer_screenshot_url: string | null
          created_at: string
          id: string
          platform_fee_20: number
          project_id: string
          seller_id: string
          seller_otp_verified: boolean
          seller_payout_80: number
          status: Database["public"]["Enums"]["trade_transaction_status"]
          total_amount_inr: number
          transaction_type: Database["public"]["Enums"]["trade_transaction_type"]
          updated_at: string
          utr_transaction_id: string | null
        }
        Insert: {
          buyer_averia_id: string
          buyer_id: string
          buyer_name: string
          buyer_otp_verified?: boolean
          buyer_screenshot_url?: string | null
          created_at?: string
          id?: string
          platform_fee_20?: number
          project_id: string
          seller_id: string
          seller_otp_verified?: boolean
          seller_payout_80?: number
          status?: Database["public"]["Enums"]["trade_transaction_status"]
          total_amount_inr: number
          transaction_type?: Database["public"]["Enums"]["trade_transaction_type"]
          updated_at?: string
          utr_transaction_id?: string | null
        }
        Update: {
          buyer_averia_id?: string
          buyer_id?: string
          buyer_name?: string
          buyer_otp_verified?: boolean
          buyer_screenshot_url?: string | null
          created_at?: string
          id?: string
          platform_fee_20?: number
          project_id?: string
          seller_id?: string
          seller_otp_verified?: boolean
          seller_payout_80?: number
          status?: Database["public"]["Enums"]["trade_transaction_status"]
          total_amount_inr?: number
          transaction_type?: Database["public"]["Enums"]["trade_transaction_type"]
          updated_at?: string
          utr_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "trade_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_personal_chats: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          media_url: string | null
          metadata: Json
          read: boolean
          receiver_id: string
          reply_to: string | null
          self_destruct: boolean
          sender_id: string
          viewed_at: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          read?: boolean
          receiver_id: string
          reply_to?: string | null
          self_destruct?: boolean
          sender_id: string
          viewed_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          read?: boolean
          receiver_id?: string
          reply_to?: string | null
          self_destruct?: boolean
          sender_id?: string
          viewed_at?: string | null
        }
        Relationships: []
      }
      user_posts: {
        Row: {
          comments_count: number | null
          content: string | null
          created_at: string
          environment_context: string
          id: string
          likes_count: number | null
          media_type: string | null
          media_url: string | null
          user_id: string
        }
        Insert: {
          comments_count?: number | null
          content?: string | null
          created_at?: string
          environment_context?: string
          id?: string
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          user_id: string
        }
        Update: {
          comments_count?: number | null
          content?: string | null
          created_at?: string
          environment_context?: string
          id?: string
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_trust_scores: {
        Row: {
          admin_score_override: number | null
          breakdown: Json
          cycle_offset: number
          id: string
          level: string
          pro_unlocks_count: number
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_score_override?: number | null
          breakdown?: Json
          cycle_offset?: number
          id?: string
          level?: string
          pro_unlocks_count?: number
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_score_override?: number | null
          breakdown?: Json
          cycle_offset?: number
          id?: string
          level?: string
          pro_unlocks_count?: number
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          coins: number
          created_at: string
          id: string
          last_daily_claim: string | null
          total_earned: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coins?: number
          created_at?: string
          id?: string
          last_daily_claim?: string | null
          total_earned?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          id?: string
          last_daily_claim?: string | null
          total_earned?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_items: {
        Row: {
          content: string | null
          created_at: string
          environment_context: string
          id: string
          kind: string
          media_url: string | null
          metadata: Json
          title: string | null
          user_id: string
          vault_type: Database["public"]["Enums"]["vault_type"]
        }
        Insert: {
          content?: string | null
          created_at?: string
          environment_context?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          title?: string | null
          user_id: string
          vault_type: Database["public"]["Enums"]["vault_type"]
        }
        Update: {
          content?: string | null
          created_at?: string
          environment_context?: string
          id?: string
          kind?: string
          media_url?: string | null
          metadata?: Json
          title?: string | null
          user_id?: string
          vault_type?: Database["public"]["Enums"]["vault_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_user_email: { Args: { _user_id: string }; Returns: string }
      admin_list_joint_accounts: { Args: never; Returns: Json }
      admin_list_news_audits: { Args: never; Returns: Json }
      admin_list_trade_listings: { Args: never; Returns: Json }
      admin_list_users: { Args: never; Returns: Json }
      admin_review_payment: {
        Args: { _admin_notes?: string; _decision: string; _payment_id: string }
        Returns: Json
      }
      admin_set_ats_score: {
        Args: { _score: number; _user_id: string }
        Returns: number
      }
      admin_set_joint_active: {
        Args: { _active: boolean; _workspace_id: string }
        Returns: boolean
      }
      admin_set_news_evidence_score: {
        Args: { _news_id: string; _score: number }
        Returns: boolean
      }
      admin_set_trade_audit_status: {
        Args: { _project_id: string; _status: string }
        Returns: boolean
      }
      admin_set_user_subscription: {
        Args: { _tier: string; _user_id: string }
        Returns: boolean
      }
      claim_ats_pro_cycle: { Args: never; Returns: Json }
      complete_trade_purchase: {
        Args: { _transaction_id: string }
        Returns: boolean
      }
      current_workspace_peer: {
        Args: { _workspace_id: string }
        Returns: string
      }
      generate_averia_id: { Args: never; Returns: string }
      get_my_grants_to_peer: { Args: { _workspace_id: string }; Returns: Json }
      get_peer_ai_conversations: {
        Args: { _target_user: string; _workspace_id: string }
        Returns: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_peer_ai_messages: {
        Args: {
          _conversation_id: string
          _target_user: string
          _workspace_id: string
        }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_peer_chat_threads: {
        Args: { _target_user: string; _workspace_id: string }
        Returns: {
          last_at: string
          last_message: string
          other_user: string
        }[]
      }
      get_peer_grants_to_me: { Args: { _workspace_id: string }; Returns: Json }
      get_peer_private_messages: {
        Args: {
          _other_user: string
          _target_user: string
          _workspace_id: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          read: boolean
          receiver_id: string
          sender_id: string
          shared_workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "private_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_peer_scan_history: {
        Args: { _target_user: string; _workspace_id: string }
        Returns: {
          content_type: string
          content_url: string
          created_at: string
          environment_context: string
          id: string
          reasoning: string | null
          trust_score: number
          user_id: string
          verdict: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scan_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_peer_vault_items: {
        Args: {
          _target_user: string
          _vault_type: string
          _workspace_id: string
        }
        Returns: {
          content: string | null
          created_at: string
          environment_context: string
          id: string
          kind: string
          media_url: string | null
          metadata: Json
          title: string | null
          user_id: string
          vault_type: Database["public"]["Enums"]["vault_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "vault_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_trust_level: { Args: { _score: number }; Returns: string }
      has_personal_vault_pin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      mark_trade_buyer_verified: {
        Args: { _transaction_id: string }
        Returns: boolean
      }
      peer_has_permission: {
        Args: {
          _permission: string
          _target_user: string
          _workspace_id: string
        }
        Returns: boolean
      }
      recompute_trust_score: { Args: { _user_id: string }; Returns: undefined }
      set_personal_vault_pin: { Args: { _pin: string }; Returns: boolean }
      verify_personal_vault_pin: { Args: { _pin: string }; Returns: boolean }
      verify_trade_listing: { Args: { _project_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      joint_request_status: "pending" | "accepted" | "declined" | "cancelled"
      payment_status: "pending" | "approved" | "rejected"
      trade_activity_action: "LISTED" | "SOLD" | "TRANSFERRED"
      trade_asset_category:
        | "Website"
        | "App"
        | "Image"
        | "Video"
        | "Audio"
        | "SaaS"
      trade_audit_status: "pending" | "verified" | "rejected"
      trade_transaction_status:
        | "payment_pending"
        | "under_audit"
        | "transferred"
        | "disputed"
      trade_transaction_type: "SALE" | "BUY"
      vault_type: "public" | "ghost" | "agentic"
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
      app_role: ["admin", "user"],
      joint_request_status: ["pending", "accepted", "declined", "cancelled"],
      payment_status: ["pending", "approved", "rejected"],
      trade_activity_action: ["LISTED", "SOLD", "TRANSFERRED"],
      trade_asset_category: [
        "Website",
        "App",
        "Image",
        "Video",
        "Audio",
        "SaaS",
      ],
      trade_audit_status: ["pending", "verified", "rejected"],
      trade_transaction_status: [
        "payment_pending",
        "under_audit",
        "transferred",
        "disputed",
      ],
      trade_transaction_type: ["SALE", "BUY"],
      vault_type: ["public", "ghost", "agentic"],
    },
  },
} as const
