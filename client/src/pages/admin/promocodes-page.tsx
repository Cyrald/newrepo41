import { useState } from "react"
import { Plus, Search, MoreHorizontal, Pencil, Trash2, CheckCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { usePromocodes, useDeletePromocode } from "@/hooks/usePromocodes"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PromocodeFormDialog } from "@/components/promocode-form-dialog"
import type { Promocode } from "@shared/schema"
import { format } from "date-fns"
import { ru } from "date-fns/locale"

export default function AdminPromocodesPage() {
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedPromocode, setSelectedPromocode] = useState<Promocode | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [promocodeToDelete, setPromocodeToDelete] = useState<string | null>(null)

  const { data: promocodes = [], isLoading } = usePromocodes()
  const deletePromocode = useDeletePromocode()

  const filteredPromocodes = promocodes.filter((promocode) =>
    promocode.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleAddPromocode = () => {
    setSelectedPromocode(null)
    setIsFormOpen(true)
  }

  const handleEditPromocode = (promocode: Promocode) => {
    setSelectedPromocode(promocode)
    setIsFormOpen(true)
  }

  const handleDeletePromocode = (promocodeId: string) => {
    setPromocodeToDelete(promocodeId)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!promocodeToDelete) return

    try {
      await deletePromocode.mutateAsync(promocodeToDelete)
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить промокод",
        variant: "destructive",
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setPromocodeToDelete(null)
    }
  }

  const getTypeBadge = (type: string) => {
    return type === "single_use" ? "Одноразовый" : "Временный"
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Загрузка промокодов...</div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif font-semibold" data-testid="text-page-title">
              Промокоды
            </h1>
            <p className="text-muted-foreground">
              Управление промокодами и скидками
            </p>
          </div>
          <Button onClick={handleAddPromocode} data-testid="button-add-promocode">
            <Plus className="mr-2 h-4 w-4" />
            Добавить промокод
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Все промокоды</CardTitle>
            <CardDescription>
              {promocodes.length} промокодов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Поиск по коду..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {filteredPromocodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">
                  {searchQuery ? "Промокоды не найдены" : "Нет промокодов"}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Код</TableHead>
                      <TableHead>Скидка</TableHead>
                      <TableHead>Мин. сумма</TableHead>
                      <TableHead>Макс. скидка</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Истекает</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPromocodes.map((promocode) => (
                      <TableRow key={promocode.id}>
                        <TableCell className="font-medium font-mono">
                          {promocode.code}
                        </TableCell>
                        <TableCell>
                          {promocode.discountPercentage}%
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {Number(promocode.minOrderAmount).toLocaleString()} ₽
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {promocode.maxDiscountAmount
                            ? `${Number(promocode.maxDiscountAmount).toLocaleString()} ₽`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getTypeBadge(promocode.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {promocode.expiresAt
                            ? format(new Date(promocode.expiresAt), "d MMM yyyy", { locale: ru })
                            : "Без срока"}
                        </TableCell>
                        <TableCell>
                          {promocode.isActive ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-sm">Активен</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">Неактивен</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Действия</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleEditPromocode(promocode)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Редактировать
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeletePromocode(promocode.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PromocodeFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        promocode={selectedPromocode}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить промокод?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Промокод будет удален навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
