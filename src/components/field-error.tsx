/**
 * A form's error next to the field it is about (the action names the field); errors
 * about no one field stay with the Save button.
 */
export function FieldError({ state, name }: { state: { error?: string; field?: string }; name: string }) {
  if (!state.error || state.field !== name) return null;
  return (
    <p id={`${name}-error`} role="alert" className="text-sm text-red-600">
      {state.error}
    </p>
  );
}
