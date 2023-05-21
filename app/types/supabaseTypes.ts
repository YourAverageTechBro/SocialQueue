export type User = {
  id: string;
  created_at: string;
  account_tier: string;
  notion_access_token: string;
  notion_bot_id: string;
  notion_duplicated_template_id: string;
  notion_owner: Record<string, any>;
  notion_workspace_icon: string;
  notion_workspace_id: string;
  notion_workspace_name: string;
  email: string;
  SocialAccounts: SocialAccounts[];
};

export type SocialAccounts = {
  id: number;
  social_id: string;
  created_at: string;
  social_platform: string;
  access_token: string;
  user_id: string;
  username: string;
};

export type InstagramPost = {
  id: string;
  created_at: string;
  post_url: string;
  status: PostStatus;
  post_id: string;
  notion_page_id: string;
  time_to_post: string;
  caption: string;
  access_token: string;
  media_urls: string;
  instagram_account_id: string;
  media_type: InstagramMediaType;
  instagram_container_id: string;
};

export enum PostStatus {
  QUEUED = "QUEUED",
  PUBLISHED = "PUBLISHED",
  PROCESSING = "PROCESSING",
  FAILED = "FAILED",
}

// If posting a normal image, no media type necessary
export enum InstagramMediaType {
  REELS = "REELS",
  CAROUSEL = "CAROUSEL",
  VIDEO = "VIDEO",
}

export enum SocialMediaPlatform {
  INSTAGRAM = "INSTAGRAM",
}
