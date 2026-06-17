import {
  Award,
  Bell,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  GraduationCap,
  History,
  KeyRound,
  LayoutDashboard,
  QrCode,
  Settings,
  ShieldCheck,
  Timer,
  UserRound,
  Users,
} from "lucide-react"
import type { ItemNav } from "@/components/layout/nav-links"

const ic = "size-4"
const icMobile = "size-5"

export const NAV_GESTOR: ItemNav[] = [
  { href: "/gestao", rotulo: "Início", icone: <LayoutDashboard className={ic} /> },
  { href: "/gestao/gestores", rotulo: "Gestores", icone: <ShieldCheck className={ic} /> },
  { href: "/gestao/alunos", rotulo: "Alunos", icone: <Users className={ic} /> },
  { href: "/gestao/professores", rotulo: "Professores", icone: <UserRound className={ic} /> },
  { href: "/gestao/modalidades", rotulo: "Modalidades", icone: <GraduationCap className={ic} /> },
  { href: "/gestao/turmas", rotulo: "Turmas e horários", icone: <CalendarDays className={ic} /> },
  { href: "/gestao/checkin", rotulo: "Check-in", icone: <QrCode className={ic} /> },
  { href: "/gestao/financeiro", rotulo: "Financeiro", icone: <CreditCard className={ic} /> },
  { href: "/gestao/conciliacao", rotulo: "Conciliação", icone: <ClipboardCheck className={ic} /> },
  { href: "/gestao/relatorios", rotulo: "Relatórios", icone: <FileBarChart className={ic} /> },
  { href: "/gestao/auditoria", rotulo: "Auditoria", icone: <ShieldCheck className={ic} /> },
  { href: "/gestao/notificacoes", rotulo: "Notificações", icone: <Bell className={ic} /> },
  { href: "/gestao/configuracoes", rotulo: "Configurações", icone: <Settings className={ic} /> },
  { href: "/gestao/perfil", rotulo: "Minha conta", icone: <KeyRound className={ic} /> },
]

export const NAV_SECRETARIA: ItemNav[] = NAV_GESTOR

export const NAV_PROFESSOR: ItemNav[] = [
  { href: "/professor", rotulo: "Início", icone: <LayoutDashboard className={ic} /> },
  { href: "/professor/turmas", rotulo: "Minhas aulas", icone: <CalendarDays className={ic} /> },
  { href: "/professor/graduacoes", rotulo: "Graduações", icone: <Award className={ic} /> },
  { href: "/professor/notificacoes", rotulo: "Notificações", icone: <Bell className={ic} /> },
  { href: "/professor/perfil", rotulo: "Minha conta", icone: <KeyRound className={ic} /> },
]

export const NAV_ALUNO: ItemNav[] = [
  { href: "/aluno", rotulo: "Agenda", icone: <CalendarDays className={icMobile} /> },
  { href: "/aluno/checkin", rotulo: "Check-in", icone: <QrCode className={icMobile} /> },
  { href: "/aluno/horas", rotulo: "Horas", icone: <Timer className={icMobile} /> },
  { href: "/aluno/graduacoes", rotulo: "Graduações", icone: <Award className={icMobile} /> },
  { href: "/aluno/financeiro", rotulo: "Financeiro", icone: <CreditCard className={icMobile} /> },
  { href: "/aluno/perfil", rotulo: "Perfil", icone: <History className={icMobile} /> },
]
