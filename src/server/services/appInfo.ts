import { api } from "../http";
export async function getVersion():Promise<string>{return (await api<{version:string}>("/auth")).version;}
