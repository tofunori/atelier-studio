import { beforeEach, expect, it, vi } from "vitest";
import { draftAssetUrl, draftViewerUrl, requestRagdoc } from "./ragdocWorkspace";
import { wsSend } from "./wsBus";
vi.mock("./wsBus",()=>({wsReady:()=>true,wsSend:vi.fn(()=>true)}));
beforeEach(()=>vi.clearAllMocks());
it("confines preview URLs and preserves the gallery nonce",()=>{
  expect(draftAssetUrl("http://127.0.0.1:19000","aabbccddeeff","../secret.png")).toBeNull();
  expect(draftViewerUrl("https://example.com","aabbccddeeff")).toBeNull();
  const url=new URL(draftViewerUrl("http://127.0.0.1:19000/x#atelier_nonce=abc","aabbccddeeff",2)!);
  expect(url.searchParams.get("file")).toBe("ragdoc-draft/aabbccddeeff/original.pdf");expect(url.hash).toBe("#atelier_nonce=abc");
});
it("correlates a response and propagates read failures",async()=>{
  const pending=requestRagdoc("articleReview",{draftId:"aabbccddeeff"});
  const message=vi.mocked(wsSend).mock.calls[0][0] as {requestId:string};
  window.dispatchEvent(new CustomEvent("ragdoc-workspace-response",{detail:{requestId:"unrelated",markdown:"wrong"}}));
  window.dispatchEvent(new CustomEvent("ragdoc-workspace-response",{detail:{requestId:message.requestId,error:"PDF absent"}}));
  await expect(pending).rejects.toThrow("PDF absent");
});
