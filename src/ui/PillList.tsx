export function PillList({
  label,
  items,
}: {
  label: string;
  items: readonly { id: string; label: string }[];
}) {
  return (
    <ul className="ui-pills" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}
