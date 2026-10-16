import {cpSync} from 'node:fs';
// Relative to this script so workspace and direct service builds agree.
cpSync(new URL('../src/templates/',import.meta.url),new URL('../dist/templates/',import.meta.url),{recursive:true});
