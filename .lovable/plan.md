# Connect this Lovable project to your "vard ai" GitHub repo

Linking a Lovable project to GitHub is a UI-only action — it can't be done through code edits. So there's nothing to build in the codebase for this request. Follow these steps in the Lovable editor:

## Steps

1. In the chat input (bottom left), open the **Plus (+) menu** → **GitHub** → **Connect project**.
2. Authorize the **Lovable GitHub App** for the account that owns "vard ai" (if not already authorized).
3. Select that GitHub account/organization.
4. Click **Create Repository** — Lovable will create a new synced repo containing this project's code.

Once connected, changes sync two-way automatically between Lovable and GitHub.

## Important limitation

Lovable does **not** support importing code from an existing GitHub repo into a Lovable project. Two situations:

- **If "vard ai" is empty** → the steps above create it fresh and push this project's code.
- **If "vard ai" already has code you want in Lovable** → you'll need to manually copy files into this project (paste code into the editor). The sync only flows this project → new repo, not the other way around for initial import.

## After connecting

- Only one GitHub account can be linked per Lovable account at a time.
- To download the code later: GitHub → **Code → Download ZIP**, or use the Code Editor's **Download codebase** button (paid plans).

## If something goes wrong

Tell me the exact error message (e.g. "repo already exists", "permission denied", "app not installed") and I can suggest the specific fix.
