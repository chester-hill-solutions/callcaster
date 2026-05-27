import { useSearchParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type QueryParamBannerVariant = {
  title?: string;
  description?: string;
  className?: string;
};

type QueryParamBannerProps = {
  param: string;
  variants: Record<string, QueryParamBannerVariant>;
  clearParams?: string[];
};

export function QueryParamBanner({
  param,
  variants,
  clearParams,
}: QueryParamBannerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(param);
  if (!value) {
    return null;
  }

  const variant = variants[value];
  if (!variant) {
    return null;
  }

  const dismiss = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(param);
      for (const key of clearParams ?? []) {
        next.delete(key);
      }
      return next;
    });
  };

  return (
    <Alert className={variant.className}>
      {variant.title ? <AlertTitle>{variant.title}</AlertTitle> : null}
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{variant.description}</span>
        <button
          type="button"
          className="text-sm underline"
          onClick={dismiss}
        >
          Dismiss
        </button>
      </AlertDescription>
    </Alert>
  );
}
