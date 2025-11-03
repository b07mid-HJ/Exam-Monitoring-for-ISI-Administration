import { createFileRoute } from '@tanstack/react-router'
import GradeHoursPage from '@/features/grade-hours'

export const Route = createFileRoute('/_authenticated/grade-hours/')({
  component: GradeHoursPage,
})
