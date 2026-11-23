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
- Text groups use hashed manual join codes, random member capabilities, and a separate creator capability checked server-side; all tables and attachment storage stay private. Why: joining permits messaging but never group deletion, and pasted content must remain plain text.
- Persist Text group connection capabilities only on the joining browser, and poll through code-protected server functions with teardown. Why: devices stay connected without exposing direct table access or requiring login.
- Keep optional email/password sign-in in public top-level pages, while all sent-share ownership and history changes are verified by authenticated server functions. Why: guest sharing remains available and browser-supplied ownership is never trusted.
