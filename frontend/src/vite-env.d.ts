/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AUTH_PAYLOAD_KEY?: string;
	readonly VITE_ENABLE_CATALOG_FALLBACK?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
