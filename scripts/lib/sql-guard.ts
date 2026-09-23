/**
 * Refuses SQL test files that carry top-level transaction control: inside `scripts/sqltest.ts` every file
 * runs in a rollback-wrapped transaction, and a top-level `commit;` would escape it and change the shared
 * project. `$$ … $$` bodies are blanked first, so plpgsql `begin … end` inside a `do` block is allowed.
 */
export function transactionControl(sqlText: string): string | null {
  const outsideBodies = sqlText.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "$$body$$");
  const m = outsideBodies.match(/^\s*(begin|start\s+transaction|commit|rollback|end)\b/im);
  return m ? m[1].toLowerCase() : null;
}
