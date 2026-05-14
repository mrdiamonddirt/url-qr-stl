/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_GAM_SCAN_LIMIT_AD_UNIT_PATH?: string;
	readonly VITE_GAM_SCAN_LIMIT_SIZES?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
