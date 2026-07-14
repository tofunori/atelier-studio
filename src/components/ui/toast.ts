const sonner = import("sonner");

export const showSuccess = async (message: string) => (await sonner).toast.success(message);
export const showError = async (message: string) => (await sonner).toast.error(message);
export const showInfo = async (message: string) => (await sonner).toast.info(message);

export async function showUndo(message: string, onUndo: () => void, label = "Annuler") {
  const { toast } = await sonner;
  return toast(message, {
    action: {
      label,
      onClick: onUndo,
    },
  });
}
