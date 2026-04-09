"use client"

import { useState, type ReactNode } from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type LogoutConfirmButtonProps = {
    trigger: (props: { onClick: () => void }) => ReactNode
    onConfirm: () => void
    title?: string
    description?: string
}

export function LogoutConfirmButton({
    trigger,
    onConfirm,
    title = "Log out?",
    description = "Are you sure you want to log out? ",
}: LogoutConfirmButtonProps) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            {trigger({ onClick: () => setIsOpen(true) })}
            <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
                <AlertDialogContent className="border-border/60 bg-background/95 shadow-2xl backdrop-blur">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{title}</AlertDialogTitle>
                        <AlertDialogDescription>{description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-end gap-3">
                        <AlertDialogCancel>No</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setIsOpen(false)
                                onConfirm()
                            }}
                            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                        >
                            Yes, log out
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
