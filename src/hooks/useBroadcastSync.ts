import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const CHANNEL = "acadkit-sync";

export function useBroadcastSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel(CHANNEL);

    channel.onmessage = () => {
      queryClient.invalidateQueries();
    };

    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.mutation?.state.status === "success") {
        channel.postMessage("invalidate");
      }
    });

    return () => {
      unsubscribe();
      channel.close();
    };
  }, [queryClient]);
}
