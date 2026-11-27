import { Link, useNavigate } from "react-router-dom"
import { ClipboardList, FolderUp, Inbox, LogIn, Upload, LogOut, Settings, ShieldCheck, User, UserCog } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { openAdmin } from "@/lib/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const triggerClass =
  "inline-flex items-center gap-1 text-sm text-white hover:text-white px-2 py-1 rounded-md border border-transparent hover:border-border"

/** Sidebar-footer login link / account menu. Items are gated on /auth/me roles. */
export default function UserMenu() {
  const { status, user, roles, logout } = useAuth()
  const navigate = useNavigate()

  if (status !== "authenticated") {
    return (
      <Link to="/login" className={triggerClass} title="Log in or create an account">
        <LogIn className="h-4 w-4" />
        <span>Login</span>
      </Link>
    )
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} title={user.email}>
        <User className="h-4 w-4" />
        <span className="max-w-[7rem] truncate">{user.first_name || "Account"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/my-requests")}>
          <ClipboardList className="h-4 w-4" /> My requests
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/account")}>
          <UserCog className="h-4 w-4" /> Account settings
        </DropdownMenuItem>
        {roles.owner && (
          <DropdownMenuItem onSelect={() => navigate("/owner")}>
            <Inbox className="h-4 w-4" /> Review requests
            {user.owner_pending_count > 0 && (
              <span className="ml-auto text-xs font-semibold text-primary">{user.owner_pending_count}</span>
            )}
          </DropdownMenuItem>
        )}
        {roles.uploader && (
          <DropdownMenuItem onSelect={() => navigate("/uploads")}>
            <Upload className="h-4 w-4" /> Data to upload
            {user.upload_pending_count > 0 && (
              <span className="ml-auto text-xs font-semibold text-primary">{user.upload_pending_count}</span>
            )}
          </DropdownMenuItem>
        )}
        {(roles.owner || roles.admin) && (
          <DropdownMenuItem onSelect={() => navigate("/shares")}>
            <FolderUp className="h-4 w-4" /> File shares
          </DropdownMenuItem>
        )}
        {roles.admin && (
          <DropdownMenuItem onSelect={openAdmin}>
            <Settings className="h-4 w-4" /> Manage records (admin)
          </DropdownMenuItem>
        )}
        {roles.owner && (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Data owner for {user.owned_organisations.length} organisation(s)
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout()
            navigate("/Home")
          }}
        >
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
