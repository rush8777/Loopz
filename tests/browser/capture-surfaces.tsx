import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import * as Dialog from "@radix-ui/react-dialog";

function App() {
  const [actions, setActions] = useState(0);
  const [open, setOpen] = useState(false);
  const act = () => setActions(count => count + 1);
  const choice = () => { act(); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest("#custom-trigger,#custom-menu")) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  return <>
    <button id="custom-trigger" onClick={event => {
      event.currentTarget.focus();
      setOpen(true);
    }} onBlur={event => {
      if (event.relatedTarget && !event.relatedTarget.closest("#custom-menu")) setOpen(false);
    }}>Custom dropdown</button>
    {open && <div id="custom-menu">
      <button id="custom-one" onClick={choice}>Custom first</button>
      <button id="custom-two" onClick={choice}>Custom second</button>
    </div>}
    <Menu.Root>
      <Menu.Trigger id="menu-trigger">Radix dropdown</Menu.Trigger>
      <Menu.Portal><Menu.Content id="radix-menu" className="surface">
        <Menu.Item id="menu-one" onSelect={act}><span>Menu first</span></Menu.Item>
        <Menu.Item id="menu-two" onSelect={act}><span>Menu second</span></Menu.Item>
        <Menu.Sub>
          <Menu.SubTrigger id="submenu-trigger">More options</Menu.SubTrigger>
          <Menu.Portal><Menu.SubContent id="submenu" className="surface">
            <Menu.Item id="sub-one" onSelect={act}>Nested first</Menu.Item>
            <Menu.Item id="sub-two" onSelect={act}>Nested second</Menu.Item>
          </Menu.SubContent></Menu.Portal>
        </Menu.Sub>
      </Menu.Content></Menu.Portal>
    </Menu.Root>
    <Select.Root onValueChange={act}>
      <Select.Trigger id="select-trigger"><Select.Value placeholder="Radix select" /></Select.Trigger>
      <Select.Portal><Select.Content id="radix-select" className="surface" position="popper">
        <Select.Viewport>
          <Select.Item id="select-one" value="first"><Select.ItemText>Select first</Select.ItemText></Select.Item>
          <Select.Item id="select-two" value="second"><Select.ItemText>Select second</Select.ItemText></Select.Item>
        </Select.Viewport>
      </Select.Content></Select.Portal>
    </Select.Root>
    <button id="popover-trigger" popoverTarget="web-popover">Open popover</button>
    <div id="web-popover" popover="auto" className="surface">
      <button id="pop-one" onClick={act}>Popover first</button>
      <button id="pop-two" onClick={act}>Popover second</button>
    </div>
    <Dialog.Root>
      <Dialog.Trigger id="dialog-trigger">Open dialog</Dialog.Trigger>
      <Dialog.Portal><Dialog.Content id="dialog" className="surface modal">
        <Dialog.Title>Confirm project</Dialog.Title>
        <Dialog.Description>Choose an action.</Dialog.Description>
        <button id="dialog-one" onClick={act}>Dialog first</button>
        <button id="dialog-two" onClick={act}>Dialog second</button>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <p><button id="before-input">Before input</button><input id="host-input" aria-label="Host input" /></p>
    <div id="editable" contentEditable suppressContentEditableWarning>Editable content</div>
    <select id="native-select" aria-label="Native select"><option>Native first</option><option>Native second</option></select>
    <p><a id="next-page" href="?page=next#/next">Next page</a></p>
    <output id="actions">{actions}</output>
  </>;
}

createRoot(document.getElementById("app")!).render(<App />);
