import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_TABS_KEY, useOpenChatTabs } from "./useOpenChatTabs";
const chats = [{id:"a",title:"A"},{id:"b",title:"B"},{id:"c",title:"C"}];
beforeEach(() => localStorage.removeItem(CHAT_TABS_KEY));
afterEach(cleanup);
describe("open chat tabs", () => {
  it("opens only the selected chat, reopens from navigation and closes without deleting chats", () => {
    const {result,rerender} = renderHook(({active}) => useOpenChatTabs("project",active,chats),{initialProps:{active:"a" as string|null}});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["a"]);
    rerender({active:"b"});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["a","b"]);
    act(()=> {expect(result.current.close(["b"])).toBe("a"); rerender({active:"a"});});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["a"]);
    rerender({active:"b"});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["a","b"]);
    expect(chats).toHaveLength(3);
  });
  it("protects pinned tabs, persists them per project and supports closing the last tab", () => {
    const {result,rerender,unmount} = renderHook(({project,active})=>useOpenChatTabs(project,active,chats),{initialProps:{project:"p1",active:"a" as string|null}});
    act(()=>result.current.togglePin("a"));
    rerender({project:"p1",active:"b"});
    act(()=>{expect(result.current.close(["a","b"])).toBe("a"); rerender({project:"p1",active:"a"});});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["a"]);
    rerender({project:"p2",active:"c"});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["c"]);
    expect(result.current.pinnedIds).toEqual([]);
    unmount();
    const restored=renderHook(({active})=>useOpenChatTabs("p1",active,chats),{initialProps:{active:"a" as string|null}});
    expect(restored.result.current.pinnedIds).toEqual(["a"]);
    act(()=>restored.result.current.togglePin("a"));
    act(()=>{expect(restored.result.current.close(["a"])).toBeNull(); restored.rerender({active:null});});
    expect(restored.result.current.openChats).toEqual([]);
  });
  it("does not discard saved tabs while records load and tolerates invalid storage", () => {
    localStorage.setItem(CHAT_TABS_KEY,JSON.stringify({p:{open:["b"],pinned:["b"]}}));
    const {result,rerender}=renderHook(({items})=>useOpenChatTabs("p",null,items),{initialProps:{items:[] as typeof chats}});
    expect(result.current.openChats).toEqual([]);
    rerender({items:chats});
    expect(result.current.openChats.map(chat=>chat.id)).toEqual(["b"]);
    expect(result.current.pinnedIds).toEqual(["b"]);
  });
});
