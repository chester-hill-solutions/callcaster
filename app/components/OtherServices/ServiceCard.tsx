export default function ServiceCard({ title, description }) {
  return (
    <li className="flex flex-col gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black">
      <h3 className="font-Zilla-Slab text-3xl font-bold">{title}</h3>
      <p className="font-Zilla-Slab text-lg font-semibold">{description}</p>
    </li>
  );
}
