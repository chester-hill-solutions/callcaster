import { Dialog, DialogContent } from "@radix-ui/react-dialog";
import { DialogHeader } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Contact } from "~/lib/types";

type PreviewContactsProps = {
    isOpen: boolean;
    onClose: () => void;
    includedContacts: number;
    previewContacts: Contact[]
}

export default function PreviewContactsDialog({ isOpen, onClose, includedContacts, previewContacts }:PreviewContactsProps) {
  return (
      
        <DialogHeader>
          <h3 className="font-Zilla-Slab text-xl font-semibold">
            Preview Contacts ({includedContacts})
          </h3>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Last Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Province</TableHead>
                <TableHead>Postal</TableHead>
                <TableHead>Other Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewContacts.map((contact) => (
                <TableRow key={contact?.id}>
                  <TableCell>{contact?.id}</TableCell>
                  <TableCell>{contact?.firstname}</TableCell>
                  <TableCell>{contact?.surname}</TableCell>
                  <TableCell>{contact?.phone}</TableCell>
                  <TableCell>{contact?.email}</TableCell>
                  <TableCell>{contact?.address}</TableCell>
                  <TableCell>{contact?.city}</TableCell>
                  <TableCell>{contact?.province}</TableCell>
                  <TableCell>{contact?.postal}</TableCell>
                  <TableCell>
                    {contact?.other_data.map((data, index) => (
                      <span key={index} className="block">
                        {JSON.stringify(data)}
                      </span>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
  );
}
