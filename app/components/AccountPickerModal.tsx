import { Dispatch, Fragment, SetStateAction, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { InstagramAccount } from "../utils/facebookSdk";

type Props = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  instagramAccounts: InstagramAccount[];
  saveUserAccounts: (instagramAccounts: InstagramAccount[]) => Promise<void>;
  alreadySelectedAccountIds: string[];
};

export default function AccountPickerModal({
  open,
  setOpen,
  instagramAccounts,
  saveUserAccounts,
  alreadySelectedAccountIds,
}: Props) {
  const cancelButtonRef = useRef(null);
  const [selectedAccounts, setSelectedAccounts] = useState<InstagramAccount[]>(
    []
  );

  const onClick = (instagramAccount: InstagramAccount) => {
    if (selectedAccounts.includes(instagramAccount)) {
      setSelectedAccounts(
        selectedAccounts.filter(
          (selectedAccount: InstagramAccount) =>
            selectedAccount.id !== instagramAccount.id
        )
      );
    } else {
      setSelectedAccounts([instagramAccount, ...selectedAccounts]);
    }
  };

  const onChange = (instagramAccount: InstagramAccount) => {
    onClick(instagramAccount);
  };

  const addAccounts = async () => {
    await saveUserAccounts(selectedAccounts);
    setOpen(false);
  };

  const newAccounts = instagramAccounts.filter(
    (instagramAccount: InstagramAccount) =>
      !alreadySelectedAccountIds.includes(
        instagramAccount.instagram_business_account.id
      ) && instagramAccount.instagram_business_account
  );

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-10"
        initialFocus={cancelButtonRef}
        onClose={setOpen}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div>
                  <div className="mt-3 text-center sm:mt-5">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900"
                    >
                      Which accounts would you like to add?
                    </Dialog.Title>
                  </div>
                </div>
                <div className="flex flex-col gap-4 mt-4">
                  {newAccounts.length > 0 ? (
                    newAccounts.map((instagramAccount: InstagramAccount) => (
                      <div
                        className="flex gap-2 items-center bg-gray-200 p-4 rounded-md hover:cursor-pointer hover:bg-gray-300 justify-between w-full"
                        onClick={() => onClick(instagramAccount)}
                        key={instagramAccount.id}
                      >
                        <div className="flex gap-2 items-center">
                          <img
                            className="rounded-full"
                            src={instagramAccount.picture.data.url}
                          />
                          <div>{instagramAccount.name}</div>
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedAccounts.includes(instagramAccount)}
                          onChange={() => onChange(instagramAccount)}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-center">
                      You have already added all of your accounts.
                    </div>
                  )}
                </div>
                {newAccounts.length > 0 ? (
                  <div className="flex justify-center mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button
                      type="button"
                      className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:col-start-2 sm:text-sm"
                      onClick={addAccounts}
                    >
                      Add to SocialQueue
                    </button>
                    <button
                      type="button"
                      className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                      onClick={() => setOpen(false)}
                      ref={cancelButtonRef}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-4 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:col-start-1 sm:text-sm"
                    onClick={() => setOpen(false)}
                    ref={cancelButtonRef}
                  >
                    Cancel
                  </button>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
