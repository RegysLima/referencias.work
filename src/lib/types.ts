export type Reference = {
  id: string;
  name: string;
  url: string;
  type: string;
  macroType: string;
  areaPrimary: string | null;
  areasSecondary: string[];
  tags: string[];
  country: string | null;
  city: string | null;
  thumbnailUrl: string | null;
  updatedAt: string;
  reviewFlags?: {
    country?: boolean;
    city?: boolean;
  };
};

export type ReferenceDB = {
  count: number;
  items: Reference[];
  updatedAt?: string;
};
