import nextConfig from 'eslint-config-next'

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'supabase/**', '.claude/**'],
  },
]

export default eslintConfig
