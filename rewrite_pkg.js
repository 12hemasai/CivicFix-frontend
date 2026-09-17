const fs = require('fs');
const yaml = require('js-yaml');
const glob = require('glob');

const pnpmWorkspaceContent = fs.readFileSync('pnpm-workspace.yaml', 'utf8');
const pnpmWorkspace = yaml.load(pnpmWorkspaceContent);

const catalog = pnpmWorkspace.catalog || {};

const pkgPaths = glob.sync('**/package.json', { ignore: 'node_modules/**' });
pkgPaths.forEach(pkgPath => {
  let pkgStr = fs.readFileSync(pkgPath, 'utf8');
  let pkg = JSON.parse(pkgStr);
  let changed = false;

  for (let key of ['dependencies', 'devDependencies']) {
    if (pkg[key]) {
      for (let dep in pkg[key]) {
        if (pkg[key][dep] === 'catalog:' || pkg[key][dep].startsWith('catalog:')) {
          const catalogKey = pkg[key][dep].replace('catalog:', '') || dep;
          if (catalog[catalogKey]) {
            pkg[key][dep] = catalog[catalogKey];
            changed = true;
          } else {
             pkg[key][dep] = "*"; // fallback
             changed = true;
          }
        } else if (pkg[key][dep] === 'workspace:*' || pkg[key][dep].startsWith('workspace:')) {
          pkg[key][dep] = '*';
          changed = true;
        }
      }
    }
  }

  // Remove preinstall only-allow, etc.
  if (pkg.scripts) {
    if (pkg.scripts.preinstall) {
       delete pkg.scripts.preinstall;
       changed = true;
    }
    for (let s in pkg.scripts) {
       if (pkg.scripts[s].includes('pnpm ')) {
           pkg.scripts[s] = pkg.scripts[s].replace(/pnpm -r --filter "(.*?)" --filter "(.*?)" --if-present run (.*)/g, "npm run $3 --workspaces --if-present");
           pkg.scripts[s] = pkg.scripts[s].replace(/pnpm -r --if-present run (.*)/g, "npm run $1 --workspaces --if-present");
           pkg.scripts[s] = pkg.scripts[s].replace(/pnpm run (.*)/g, "npm run $1");
           pkg.scripts[s] = pkg.scripts[s].replace(/pnpm /g, "npm run ");
           changed = true;
       }
    }
  }

  if (pkg.packageManager) {
    delete pkg.packageManager;
    changed = true;
  }

  // Inject workspaces into root package.json
  if (pkgPath === 'package.json') {
     pkg.workspaces = pnpmWorkspace.packages;
     pkg.overrides = pnpmWorkspace.overrides;
     changed = true;
  }

  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated ${pkgPath}`);
  }
});
