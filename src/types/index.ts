export type NewsCategory = 'general' | 'technology' | 'sports' | 'business' | 'entertainment' | 'health' | 'science';

export interface NewsArticle {
  id: string;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  content: string | null;
  category?: NewsCategory;
  tier?: 'top' | 'trending' | 'latest';
}

export interface ScanResult {
  id: string;
  trustScore: number;
  verdict: 'real' | 'fake' | 'misleading' | 'ai_generated' | 'manipulated';
  reasoning: string;
  mediaType: 'url' | 'image' | 'video';
  contentUrl: string;
  createdAt: string;
  aiConfidence: number;
  deepfakeIndicators?: string[];
}

export interface UserProfile {
  id: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isPro: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedNews {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  source: string | null;
  category: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface DebunkedNews {
  id: string;
  title: string;
  originalSource: string | null;
  claim: string;
  verdict: string;
  aiReasoning: string;
  evidenceLinks: string[];
  category: string | null;
  imageUrl: string | null;
  debunkedAt: string;
}

export interface PaymentRequest {
  id: string;
  userId: string;
  amount: number;
  utrNumber: string;
  screenshotUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  aiVerificationResult: {
    verified: boolean;
    amount_detected?: string;
    upi_id_detected?: string;
    date_detected?: string;
    confidence: number;
    issues?: string[];
  } | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  userEmail?: string;
}

export interface UserPost {
  id: string;
  userId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  userProfile?: {
    fullName: string | null;
    avatarUrl: string | null;
  };
}


export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}
