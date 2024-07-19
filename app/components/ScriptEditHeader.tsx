import { Button } from "~/components/ui/button";

export const EditorHeader = ({ isChanged, onReset, onSave }:{isChanged:boolean, onReset: () => void; onSave: () => void;}) => (
  <div className="fixed left-0 right-0 top-0 z-50 flex flex-col items-center justify-between bg-primary px-4 py-3 text-white shadow-md sm:flex-row sm:px-6 sm:py-5">
    <Button
      onClick={onReset}
      className="mb-2 w-full rounded bg-white px-4 py-2 text-gray-500 transition-colors hover:bg-red-100 sm:mb-0 sm:w-auto"
    >
      Reset
    </Button>
    <div className="mb-2 text-center text-lg font-semibold sm:mb-0 sm:text-left">
      You have unsaved changes
    </div>
    <Button
      onClick={onSave}
      className="w-full rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white sm:w-auto"
    >
      Save Changes
    </Button>
  </div>
);
