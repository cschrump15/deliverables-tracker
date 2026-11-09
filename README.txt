DELIVERABLES & ACTION ITEMS TRACKER - HOW TO PUT IT ON VERCEL
=============================================================
What's here
  index.html     the tracker (the website)
  api/items.js   small server function: checks passcodes and saves to the database
  package.json   needed by Vercel, nothing to edit

This is a SEPARATE site from your weekly workflow board, so it needs its own repository and Vercel project.
It can SHARE the same free Upstash Redis database as the workflow board (it stores its data under different names).

STEP 1 - New GitHub repository
  Create a new PRIVATE repository (e.g. deliverables-tracker) and upload index.html, package.json and the api folder
  (keep api/items.js inside the api folder).

STEP 2 - New Vercel project
  Vercel > Add New > Project > pick the new repository > Deploy. No settings need changing.

STEP 3 - Connect the database
  In the new Vercel project, go to Storage (or Connections > Storage), find your existing Upstash Redis database and
  connect it to this project. This adds the database connection settings automatically.

STEP 4 - Set the passcodes (Project > Settings > Environment Variables)
  TEAM_PASSCODE      passcode for YOUR team (internal). Internal users can add, edit and delete items.
  EXTERNAL_PASSCODE  passcode for the EXTERNAL team. External users can add and edit items but cannot delete them.
                     Items they create are automatically tagged EXTERNAL, and yours are tagged INTERNAL.
  Use two different passcodes. To cut off the external team, change EXTERNAL_PASSCODE and redeploy.

STEP 5 - Redeploy
  Deployments > latest deployment > ... > Redeploy. Open the link and enter a passcode.

NOTES
  - Task numbers (#001, #002...) and the Date Created are filled in automatically and cannot be edited.
  - "Created by" is chosen by the person adding the item from a shared people list ("+ Add person..." adds a name for everyone).
  - Status choices: Open, In progress, Waiting, Done. Done items turn gray and move to the bottom.
  - Due dates turn amber within 3 days and red when overdue.
  - The page refreshes about every 10 seconds, and "Export CSV" downloads whatever list is currently on screen.
  - Anyone with the link AND a passcode can see every item. Don't put anything on it you wouldn't share with the external team.
  - Before first use, ask IT whether project information may be stored on outside services (Vercel / Upstash).
