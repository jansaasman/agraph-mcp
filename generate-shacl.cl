(in-package :agent-graph-system)

;;; ===================================================================
;;; SHACL GENERATION UTILITY
;;; Generate SHACL shapes from actual repository data using AllegroGraph
;;; ===================================================================

(defun generate-all-repository-shacl ()
  "Generate SHACL shapes for all enterprise repositories"
  (format t "=== Generating SHACL shapes for all repositories ===~%")
  (let ((repositories '("hr-analytics" "product-engineering" "supply-chain" 
                       "inventory-management" "production-analytics" "customer-intelligence")))
    (dolist (repo repositories)
      (format t "~%Generating SHACL for ~A...~%" repo)
      (generate-and-save-shacl repo))
    (format t "~%✅ All SHACL files generated from actual repository data~%")
    (format t "=== SHACL generation complete ===~%")))

(defun regenerate-shacl (repo-name)
  "Regenerate SHACL for a specific repository"
  (format t "Regenerating SHACL for repository: ~A~%" repo-name)
  (generate-and-save-shacl repo-name))

(defun regenerate-shacl-for-repos (repo-list)
  "Regenerate SHACL for a list of specific repositories"
  (format t "Regenerating SHACL for repositories: ~{~A~^, ~}~%" repo-list)
  (dolist (repo repo-list)
    (format t "~%Generating SHACL for ~A...~%" repo)
    (generate-and-save-shacl repo))
  (format t "~%✅ SHACL regeneration complete for selected repositories~%"))

(defun list-generated-shacl-files ()
  "List all generated SHACL files in the current directory"
  (format t "Generated SHACL files:~%")
  (let ((shacl-files (directory "shacl-*-generated.ttl")))
    (if shacl-files
        (dolist (file shacl-files)
          (format t "  ~A~%" (file-namestring file)))
        (format t "  No generated SHACL files found~%"))))

(defun clean-generated-shacl ()
  "Remove all generated SHACL files"
  (format t "Cleaning up generated SHACL files...~%")
  (let ((shacl-files (directory "shacl-*-generated.ttl")))
    (dolist (file shacl-files)
      (delete-file file)
      (format t "  Deleted: ~A~%" (file-namestring file)))
    (format t "✅ Cleanup complete~%")))

(defun shacl-help ()
  "Display help for SHACL generation utilities"
  (format t "~%=== SHACL Generation Utilities ===~%")
  (format t "Available Functions:~%")
  (format t "  (generate-all-repository-shacl)     - Generate SHACL for all repositories~%")
  (format t "  (regenerate-shacl \"repo-name\")       - Generate SHACL for one repository~%")
  (format t "  (regenerate-shacl-for-repos '(...)) - Generate SHACL for specific repos~%")
  (format t "  (list-generated-shacl-files)        - List all generated SHACL files~%")
  (format t "  (clean-generated-shacl)             - Delete all generated SHACL files~%")
  (format t "  (shacl-help)                        - Show this help~%")
  (format t "~%Example Usage:~%")
  (format t "  (regenerate-shacl \"supply-chain\")~%")
  (format t "  (regenerate-shacl-for-repos '(\"hr-analytics\" \"supply-chain\"))~%")
  (format t "=== End Help ===~%"))

;; Export functions
(eval-when (load compile eval)
  (export '(generate-all-repository-shacl
            regenerate-shacl
            regenerate-shacl-for-repos
            list-generated-shacl-files
            clean-generated-shacl
            shacl-help)))

(format t "SHACL generation utilities loaded. Use (shacl-help) for available commands.~%")