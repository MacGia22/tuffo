/** What an edit form carries: the entry, the pool's time zone and the time it opened with. */
export interface EditTarget {
  id: string;
  timeZone: string;
  /** Field values as the form shows them (strings, in the person's units). */
  values: Record<string, string>;
}

/** Hidden inputs that turn a log form into an edit form; see whenFromForm. */
export function EditFields({ edit, whenField }: { edit: EditTarget | undefined; whenField: string }) {
  if (!edit) return null;
  return (
    <>
      <input type="hidden" name="id" value={edit.id} />
      <input type="hidden" name="time_zone" value={edit.timeZone} />
      <input type="hidden" name={`${whenField}_original`} value={edit.values[whenField] ?? ""} />
    </>
  );
}
