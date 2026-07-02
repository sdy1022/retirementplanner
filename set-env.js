const fs = require('fs');

const targetPath = './src/environments/environment.production.ts';

// We map Vercel's environment variables into the Angular environment file during the build process
const envConfigFile = `export const environment = {
  supabaseUrl: '${process.env.SUPABASE_URL || ''}',
  supabaseAnonKey: '${process.env.SUPABASE_ANON_KEY || ''}',
};
`;

fs.writeFileSync(targetPath, envConfigFile);
console.log(`Output generated at ${targetPath}`);
