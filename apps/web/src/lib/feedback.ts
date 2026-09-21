import { toast } from 'sonner'

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function toastError(error: unknown, fallback?: string) {
  toast.error(errorMessage(error, fallback))
}

export function toastSuccess(message: string) {
  toast.success(message)
}
