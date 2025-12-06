import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRequest } from "@/lib/queryClient"
import { getAccessToken } from "@/lib/api"
import { wsClient } from "@/lib/websocket"
import { useAuthStore } from "@/stores/authStore"
import { AdminLayout } from "@/components/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Send, MessageCircle, User, ShoppingBag, Archive, FolderClosed, FolderOpen, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import type { SupportMessage } from "@shared/schema"

interface Conversation {
  userId: string
  lastMessage: SupportMessage
  status: string
  archivedAt: Date | null
  closedAt: Date | null
}

interface CustomerInfo {
  id: string
  email: string
  firstName: string
  lastName: string | null
  patronymic: string | null
  phone: string
  bonusBalance: number
  orders: Array<{
    id: string
    orderNumber: string
    createdAt: Date
    total: string
    status: string
  }>
}

export default function AdminSupportChatPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [statusFilter, setStatusFilter] = useState<'open' | 'archived' | 'closed'>('open')
  
  const [searchEmail, setSearchEmail] = useState("")
  const [searchDateFrom, setSearchDateFrom] = useState("")
  const [searchDateTo, setSearchDateTo] = useState("")
  
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations", statusFilter],
    queryFn: async () => {
      const url = `/api/support/conversations?status=${statusFilter}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
    refetchInterval: 5000,
  })

  const { data: closedConversations = [], refetch: refetchClosedSearch } = useQuery<Conversation[]>({
    queryKey: ["/api/support/closed-search", searchEmail, searchDateFrom, searchDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchEmail) params.append('email', searchEmail);
      if (searchDateFrom) params.append('dateFrom', searchDateFrom);
      if (searchDateTo) params.append('dateTo', searchDateTo);
      
      const response = await fetch(`/api/support/closed-search?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to search conversations');
      return response.json();
    },
    enabled: statusFilter === 'closed' && (!!searchEmail || !!searchDateFrom || !!searchDateTo),
  })

  const displayConversations = statusFilter === 'closed' 
    ? (searchEmail || searchDateFrom || searchDateTo ? closedConversations : [])
    : conversations

  useEffect(() => {
    if (!selectedUserId && displayConversations.length > 0) {
      setSelectedUserId(displayConversations[0].userId)
    }
  }, [displayConversations, selectedUserId])

  const { data: messages = [], isLoading: messagesLoading } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/messages", { userId: selectedUserId }],
    queryFn: async () => {
      if (!selectedUserId) return []
      const response = await fetch(`/api/support/messages?userId=${selectedUserId}`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch messages')
      return response.json()
    },
    enabled: !!selectedUserId,
  })

  const { data: customerInfo } = useQuery<CustomerInfo>({
    queryKey: ["/api/support/customer-info", selectedUserId],
    enabled: !!selectedUserId,
  })

  const sendMessageMutation = useMutation<
    SupportMessage,
    Error,
    { userId: string; text: string },
    { previousMessages?: SupportMessage[] }
  >({
    mutationFn: async (data: { userId: string; text: string }) => {
      return apiRequest<SupportMessage>("POST", "/api/support/messages", {
        userId: data.userId,
        messageText: data.text,
      })
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/support/messages", { userId: selectedUserId }] })
      const previousMessages = queryClient.getQueryData<SupportMessage[]>(["/api/support/messages", { userId: selectedUserId }])

      if (previousMessages && user?.id) {
        const tempMessage: SupportMessage = {
          id: `temp-${Date.now()}`,
          userId: data.userId,
          senderId: user.id,
          messageText: data.text,
          createdAt: new Date(),
        } as SupportMessage

        queryClient.setQueryData<SupportMessage[]>(
          ["/api/support/messages", { userId: selectedUserId }],
          [...previousMessages, tempMessage]
        )
      }

      return { previousMessages }
    },
    onSuccess: (data) => {
      setMessage("")
      queryClient.setQueryData<SupportMessage[]>(
        ["/api/support/messages", { userId: selectedUserId }],
        (old) => {
          if (!old) return [data]
          const withoutTemp = old.filter(m => !m.id.startsWith('temp-'))
          if (withoutTemp.some(m => m.id === data.id)) return withoutTemp
          return [...withoutTemp, data]
        }
      )
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/support/messages", { userId: selectedUserId }], context.previousMessages)
      }
      toast({
        title: "Ошибка",
        description: "Не удалось отправить сообщение",
        variant: "destructive",
      })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/support/conversations/${userId}/archive`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to archive');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setSelectedUserId(null);
      toast({ title: "Успешно", description: "Обращение архивировано" });
    },
  })

  const closeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/support/conversations/${userId}/close`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to close');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setSelectedUserId(null);
      toast({ title: "Успешно", description: "Обращение закрыто" });
    },
  })

  const reopenMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/support/conversations/${userId}/reopen`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to reopen');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({ title: "Успешно", description: "Обращение переоткрыто" });
    },
  })

  useEffect(() => {
    if (user?.id) {
      const accessToken = getAccessToken()
      if (accessToken) {
        wsClient.connect(user.id, accessToken)
      }

      const unsubscribe = wsClient.onMessage((msg) => {
        if (msg.type === "new_message" && msg.message) {
          queryClient.setQueryData<SupportMessage[]>(
            ["/api/support/messages", { userId: msg.message.userId }],
            (old) => {
              if (!old) return [msg.message]
              if (old.some(m => m.id === msg.message.id)) return old
              return [...old, msg.message]
            }
          )
          queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] })
        }
      })

      return () => {
        unsubscribe()
      }
    }
  }, [user?.id, queryClient])

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  const handleSendMessage = () => {
    if (!message.trim() || !selectedUserId) return
    sendMessageMutation.mutate({ userId: selectedUserId, text: message })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-500"
      case "paid": return "bg-blue-500"
      case "shipped": return "bg-purple-500"
      case "delivered": return "bg-green-500"
      case "cancelled": return "bg-red-500"
      default: return "bg-gray-500"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "Ожидает оплаты"
      case "paid": return "Оплачен"
      case "shipped": return "Отправлен"
      case "delivered": return "Доставлен"
      case "cancelled": return "Отменён"
      default: return status
    }
  }

  const selectedConversation = displayConversations.find(c => c.userId === selectedUserId)

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-1">Чат поддержки</h1>
        <p className="text-sm text-muted-foreground">
          Управление диалогами с клиентами
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 min-h-[calc(100vh-160px)]">
        <Card className="col-span-3 flex flex-col">
          <CardHeader className="p-2">
            <CardTitle className="text-sm mb-2">Диалоги</CardTitle>
            <Tabs 
              value={statusFilter} 
              onValueChange={(value) => setStatusFilter(value as 'open' | 'archived' | 'closed')}
            >
              <TabsList className="h-auto flex-col items-stretch w-full p-1 bg-muted/30">
                <TabsTrigger 
                  value="open" 
                  className="justify-start text-[11px] h-6 px-2"
                >
                  <FolderOpen className="h-2.5 w-2.5 mr-1.5" />
                  Открытые
                </TabsTrigger>
                <TabsTrigger 
                  value="archived" 
                  className="justify-start text-[11px] h-6 px-2"
                >
                  <Archive className="h-2.5 w-2.5 mr-1.5" />
                  Архив
                </TabsTrigger>
                <TabsTrigger 
                  value="closed" 
                  className="justify-start text-[11px] h-6 px-2"
                >
                  <FolderClosed className="h-2.5 w-2.5 mr-1.5" />
                  Закрытые
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {statusFilter === 'closed' && (
              <div className="mt-2 space-y-1.5 pt-2 border-t">
                <Input
                  placeholder="Email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="h-6 text-[11px]"
                />
                <div className="grid grid-cols-2 gap-1">
                  <Input
                    type="date"
                    placeholder="От"
                    value={searchDateFrom}
                    onChange={(e) => setSearchDateFrom(e.target.value)}
                    className="h-6 text-[11px]"
                  />
                  <Input
                    type="date"
                    placeholder="До"
                    value={searchDateTo}
                    onChange={(e) => setSearchDateTo(e.target.value)}
                    className="h-6 text-[11px]"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => refetchClosedSearch()}
                  className="w-full h-6 text-[11px]"
                  variant="secondary"
                >
                  <Search className="h-2.5 w-2.5 mr-1" />
                  Поиск
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {displayConversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">
                    {statusFilter === 'closed' && !searchEmail && !searchDateFrom && !searchDateTo
                      ? 'Используйте поиск для просмотра закрытых чатов'
                      : 'Нет диалогов'
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {displayConversations.map((conv) => (
                    <button
                      key={conv.userId}
                      onClick={() => setSelectedUserId(conv.userId)}
                      className={`w-full text-left p-2 hover:bg-accent transition-colors ${
                        selectedUserId === conv.userId ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <User className="h-2.5 w-2.5 text-muted-foreground" />
                          <span className="font-medium text-[11px]">
                            #{conv.userId.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-0.5">
                        {conv.lastMessage.messageText}
                      </p>
                      <span className="text-[9px] text-muted-foreground">
                        {format(new Date(conv.lastMessage.createdAt), "dd MMM, HH:mm", {
                          locale: ru,
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="col-span-6 flex flex-col">
          <CardHeader className="border-b p-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5" />
                {selectedUserId ? `Диалог` : "Выберите диалог"}
              </CardTitle>
              {selectedUserId && selectedConversation && (
                <div className="flex gap-1">
                  {selectedConversation.status === 'open' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => archiveMutation.mutate(selectedUserId)}
                        disabled={archiveMutation.isPending}
                        className="h-6 text-[11px]"
                      >
                        <Archive className="h-2.5 w-2.5 mr-1" />
                        Архивировать
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeMutation.mutate(selectedUserId)}
                        disabled={closeMutation.isPending}
                        className="h-6 text-[11px]"
                      >
                        <FolderClosed className="h-2.5 w-2.5 mr-1" />
                        Закрыть
                      </Button>
                    </>
                  )}
                  {selectedConversation.status === 'archived' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reopenMutation.mutate(selectedUserId)}
                        disabled={reopenMutation.isPending}
                        className="h-6 text-[11px]"
                      >
                        <FolderOpen className="h-2.5 w-2.5 mr-1" />
                        Переоткрыть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeMutation.mutate(selectedUserId)}
                        disabled={closeMutation.isPending}
                        className="h-6 text-[11px]"
                      >
                        <FolderClosed className="h-2.5 w-2.5 mr-1" />
                        Закрыть
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 flex flex-col flex-1 min-h-0">
            {!selectedUserId ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Выберите диалог из списка слева</p>
                </div>
              </div>
            ) : (
              <>
                <ScrollArea ref={scrollAreaRef} className="flex-1 p-2">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                        <p className="mt-2 text-xs text-muted-foreground">Загрузка...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((msg) => {
                        const isCustomerMessage = msg.senderId === selectedUserId
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col gap-0.5 ${
                              isCustomerMessage ? "items-start" : "items-end"
                            }`}
                          >
                            <div
                              className={`max-w-[75%] rounded-xl px-2.5 py-1.5 shadow-sm ${
                                isCustomerMessage
                                  ? "bg-muted/70 rounded-tl-sm"
                                  : "bg-primary text-primary-foreground rounded-tr-sm"
                              }`}
                            >
                              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                                {msg.messageText}
                              </p>
                            </div>
                            <span className="text-[9px] text-muted-foreground px-1">
                              {format(new Date(msg.createdAt), "HH:mm", { locale: ru })}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </ScrollArea>

                {selectedConversation?.status !== 'closed' && (
                  <div className="p-2 border-t bg-muted/20">
                    <div className="flex gap-2 items-end">
                      <Textarea
                        placeholder="Введите ответ..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyPress}
                        rows={1}
                        className="resize-none flex-1 bg-background min-h-[2rem] text-xs"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!message.trim() || sendMessageMutation.isPending}
                        size="icon"
                        className="h-8 w-8 shrink-0"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1 px-0.5">
                      Enter — отправить, Shift+Enter — новая строка
                    </p>
                  </div>
                )}
                
                {selectedConversation?.status === 'closed' && (
                  <div className="p-2 border-t bg-muted/40 text-center">
                    <p className="text-[11px] text-muted-foreground">
                      Чат закрыт. Сообщения сохранены в соответствии с 152-ФЗ.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 flex flex-col">
          <CardHeader className="p-2">
            <CardTitle className="text-sm">Информация о клиенте</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            {!selectedUserId ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Выберите диалог
              </p>
            ) : !customerInfo ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-xs text-muted-foreground">Загрузка...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-xs mb-1.5 flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    Личные данные
                  </h3>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Имя:</span>
                      <p className="font-medium">
                        {customerInfo.firstName}{" "}
                        {customerInfo.lastName && customerInfo.lastName}{" "}
                        {customerInfo.patronymic && customerInfo.patronymic}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <p className="font-medium break-all">{customerInfo.email}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Телефон:</span>
                      <p className="font-medium">{customerInfo.phone}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Бонусы:</span>
                      <p className="font-medium">{customerInfo.bonusBalance} ₽</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold text-xs mb-1.5 flex items-center gap-1.5">
                    <ShoppingBag className="h-3 w-3" />
                    История заказов
                  </h3>
                  <ScrollArea className="h-[280px]">
                    {customerInfo.orders.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Нет заказов
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {customerInfo.orders.map((order) => (
                          <div
                            key={order.id}
                            className="p-2 border rounded-md text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">№{order.orderNumber}</span>
                              <Badge className={`text-[10px] h-4 ${getStatusBadgeColor(order.status)}`}>
                                {getStatusText(order.status)}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-[10px]">
                              {format(new Date(order.createdAt), "dd MMM yyyy", {
                                locale: ru,
                              })}
                            </p>
                            <p className="font-semibold">{order.total} ₽</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
