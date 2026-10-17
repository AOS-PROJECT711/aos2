<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Classroom access is code-based with no login: all classroom reads/writes go through server functions in src/lib/classroom.functions.ts that verify the admin or receiver code, and the classroom tables/bucket have no public access. Why: codes must be checked server-side so a receiver code can never modify files.
- Transfer helpers are shared across Send, Receive, and Classroom; uploads use bounded concurrency and direct storage requests, while large downloads stream to disk or delegate to the browser. Why: accurate byte progress must not require proxying files or buffering multi-GB downloads.
