# Requirements
## Summary
Untitled Management Software is a schoolwork management dashboard for university students to track assignments, class schedules, notes, and events in one place. It helps students stay on top of deadlines, avoid missing coursework, and plan their daily class attendance. The app uses mock data and serves a single student user role.

## Use cases
- Dashboard shell with navigation and overview widgets
  1) User opens the app and sees a sidebar with navigation links (Dashboard, Calendar, Class Schedule, Homework, Notes, Courses) and top account actions (Feedback, Account, Log Out).
  2) User lands on the Dashboard page showing four widgets: Upcoming Assignments, Classes Today, Late Assignments, and Upcoming Events.
  3) User clicks "Add Assignment" to open a form to quickly add a new assignment.
  4) User clicks "Add Event" to open a form to quickly add a new upcoming event.
  5) User clicks "Open Notes" on a class in Classes Today to navigate to that class's notes.
  6) User clicks a late assignment row to see more details about it.

- Manage Homework/Assignments
  1) User navigates to the Homework page from the sidebar.
  2) User sees a list/table of all assignments with course, name, due date, and status (upcoming, late, completed).
  3) User filters assignments by course or status.
  4) User adds a new assignment with name, course, due date, and description.
  5) User marks an assignment as completed or edits/deletes it.

- Manage Class Schedule
  1) User navigates to the Class Schedule page from the sidebar.
  2) User sees a weekly view of classes with course code, time, and day.
  3) User adds, edits, or removes a class session.

- Manage Calendar and Events
  1) User navigates to the Calendar page from the sidebar.
  2) User sees a calendar view with assignments, classes, and events plotted by date.
  3) User adds a new event with title, date, time, and description.
  4) User clicks an existing event/assignment on the calendar to view or edit details.

- Manage Notes
  1) User navigates to the Notes page from the sidebar.
  2) User sees a list of notes grouped or filterable by course.
  3) User creates a new note tied to a course/class session.
  4) User opens, edits, or deletes an existing note.

- Manage Courses
  1) User navigates to the Courses section from the sidebar (dropdown).
  2) User sees a list of enrolled courses with course code and name.
  3) User adds a new course or edits/removes an existing one.
  4) User clicks a course to view its related assignments, schedule, and notes.

## Plan
### Dashboard shell with navigation and overview widgets
1. [x] Create app shell layout with left sidebar (logo/title "Untitled Management Software", Feedback/Account/Log Out buttons, navigation links: Dashboard, Calendar, Class Schedule, Homework with late-count badge, Notes, Courses dropdown) and main content area.
2. [x] Implement routing so sidebar links navigate between Dashboard, Calendar, Class Schedule, Homework, Notes, and Courses pages.
3. [x] Build Dashboard page with a responsive grid of four widget cards: Upcoming Assignments, Classes Today, Late Assignments, Upcoming Events.
4. [x] Implement Upcoming Assignments widget with empty state ("No Assignments" / "You have no upcoming assignments!") and "+ Add Assignment" button opening a form dialog (name, course, due date).
5. [x] Implement Classes Today widget listing today's classes (course code, time range, "Open Notes" button) using mock data.
6. [x] Implement Late Assignments widget as a table (Name, Due Date columns) with color-coded rows using mock data.
7. [x] Implement Upcoming Events widget with empty state ("No Events" / "You have no upcoming events!") and "+ Add Event" button opening a form dialog (title, date, time, description).
8. [x] Wire "Open Notes" button to navigate to the Notes page filtered by that course.
9. [x] Set up mock data models for courses, assignments, class schedule, and events shared across widgets.

### Manage Homework/Assignments
1. [x] Build Homework page with a table/list of all assignments (course, name, due date, status).
2. [x] Add filters for course and status (upcoming, late, completed).
3. [x] Add "Add Assignment" form dialog to create new assignments.
4. [x] Add ability to mark assignment complete, edit, or delete from the list.
5. [x] Reflect late assignment count as a badge on the Homework sidebar link.

### Manage Class Schedule
1. [x] Build Class Schedule page with a weekly grid/list view of classes (course code, day, time).
2. [x] Add form to create a new class session (course, day, start/end time).
3. [x] Add ability to edit or delete an existing class session.

### Manage Calendar and Events
1. [x] Build Calendar page with month/week view showing assignments, classes, and events on their dates.
2. [x] Add "Add Event" form dialog (title, date, time, description).
3. [x] Add click interaction on calendar items to view/edit details in a dialog.

### Manage Notes
1. [x] Build Notes page listing notes with course grouping/filter.
2. [x] Add "Add Note" form dialog tied to a course/class session (title, content).
3. [x] Add ability to open, edit, and delete existing notes.

### Manage Courses
1. [x] Build Courses page/dropdown listing enrolled courses (course code, name).
2. [x] Add form to create a new course and edit/delete existing courses.
3. [x] Link each course to its related assignments, schedule entries, and notes via navigation.
