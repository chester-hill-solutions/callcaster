import { FaCopy } from "react-icons/fa6";

export default function StyleGuide() {
  const colours = [
    {
      name: "brand primary",
      copyText: "bg-brand-primary",
      hex: "#c91d25",
      rgb: "201, 29, 37",
      hsl: "357, 75%, 45%",
    },
    {
      name: "brand secondary",
      copyText: "bg-brand-secondary",
      hex: "#bdebff",
      rgb: "189, 235, 255",
      hsl: "198, 100%, 87%",
    },
    {
      name: "brand tertiary",
      copyText: "bg-brand-tertiary",
      hex: "#fac7cc",
      rgb: "250, 199, 204",
      hsl: "354, 83%, 88%",
    },
  ];

  const handleRippleEffect = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - (btn.offsetLeft + radius)}px`;
    circle.style.top = `${e.clientY - (btn.offsetTop + radius)}px`;
    circle.classList.add("ripple");

    const ripple = btn.getElementsByClassName("ripple")[0];
    if (ripple) {
      ripple.remove();
    }

    btn.appendChild(circle);
  };

  return (
    <main className="flex h-screen flex-grow-[1] flex-col gap-4 p-8">
      <h1 className="border-b-4 border-t-4 border-brand-secondary py-2 font-Tabac-Slab text-4xl font-bold">
        <span className="text-brand-primary">CallCaster </span>Style Guide
      </h1>
      <section
        id="all-styles"
        className="flex h-full flex-col gap-4 rounded-lg"
      >
        <h3 className="font-Zilla-Slab text-6xl font-bold">Colours</h3>
        <section id="colours" className="flex gap-4">
          <div className="grid w-full auto-rows-auto grid-cols-3 gap-8">
            {colours.map((colour, i) => {
              return (
                <div key={i} id="colour-cell" className="flex flex-col gap-2">
                  <button
                    className={
                      colour.copyText +
                      " group relative aspect-square w-full overflow-hidden rounded-full border-2 border-black"
                    }
                    onClick={(e) => {
                      handleRippleEffect(e);
                      navigator.clipboard.writeText(colour.copyText);
                    }}
                  >
                    <div
                      id="colour-tooltip-pending"
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-md bg-white px-2 py-1 font-semibold opacity-0 transition duration-200 ease-in-out group-hover:opacity-85 group-focus:hidden"
                    >
                      Copy: "{colour.copyText}"
                    </div>

                    <div
                      id="colour-tooltip-clicked"
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-md bg-white px-2 py-2 text-xl font-semibold text-green-600 opacity-0 transition duration-200 ease-in-out group-focus:opacity-100"
                    >
                      <FaCopy className="inline text-green-600" />
                      <span className="ml-2">{colour.copyText}</span>
                    </div>
                  </button>
                  <p className="font-Zilla-Slab text-xl font-bold capitalize">
                    {colour.name}
                  </p>
                  <button
                    className="text-left font-Zilla-Slab text-xl font-semibold transition ease-in-out hover:text-brand-primary"
                    onClick={() => navigator.clipboard.writeText(colour.hex)}
                  >
                    Hex: {colour.hex}
                  </button>
                  <button
                    className="text-left font-Zilla-Slab text-xl font-semibold transition ease-in-out hover:text-brand-primary"
                    onClick={() => navigator.clipboard.writeText(colour.rgb)}
                  >
                    RGB: {colour.rgb.replaceAll(",", " /")}
                  </button>
                  <button
                    className="text-left font-Zilla-Slab text-xl font-semibold transition ease-in-out hover:text-brand-primary"
                    onClick={() => navigator.clipboard.writeText(colour.hsl)}
                  >
                    HSL: {colour.hsl.replaceAll(",", " /")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
