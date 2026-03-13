"use client";

import useSWR, { type KeyedMutator } from "swr";

interface UsePollingResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
}

export function usePolling<T>(
  key: string,
  fetcher: () => Promise<T>,
  intervalMs = 30000
): UsePollingResult<T> {
  const { data, error, isLoading, mutate } = useSWR<T, Error>(key, fetcher, {
    refreshInterval: intervalMs,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });

  return { data, error, isLoading, mutate };
}
